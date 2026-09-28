# Protótipo — GCC dark institucional + Modo TV

Protótipo **estático** (HTML + CSS puro, **zero JavaScript**) da versão escura institucional do
GLPI Control Center e do **Modo TV** do monitor da equipe de T.I.

> Nenhum arquivo de produção foi alterado. Tudo vive em `prototipos/modo-tv-gcc/`.
> Abra `index.html` no navegador para começar.

---

## 1. Telas

| Arquivo | Tela |
|---|---|
| `index.html` | Índice com links para todas as telas |
| `dashboard-ativos.html` | Dashboard operacional de ativos (KPIs, barras, chamados, atenção, status) + botão **Ativar modo TV** |
| `dashboard-chamados.html` | Chamados das salas (filtros, resumo do período, 3 rankings, tabela, paginação) + botão **Ativar modo TV** |
| `inventario.html` | Inventário geral (busca, filtros, tabela, paginação) |
| `estados.html` | Galeria de estados: carregando, vazio, erro, sem conexão, aviso, alerta (TV) + badges |
| `tv-ativos.html` | **Modo TV 1920×1080** — painel de ativos |
| `tv-chamados.html` | **Modo TV 1920×1080** — painel de chamados |
| `tv-alerta.html` | **Modo TV** — estado de alerta (chamado novo) |

Navegação: `Ativar modo TV` → painel TV → `Sair do modo TV` → dashboard.
Indicador `01 Ativos / 02 Chamados` alterna entre os dois painéis.

## 2. Estrutura

```
prototipos/modo-tv-gcc/
├── *.html                    # 8 telas
├── css/
│   ├── tokens.css            # variáveis de cor, tipografia, espaçamento, raios
│   ├── base.css              # reset, botões, campos, tabela, badges, estados, banners
│   ├── app.css               # shell desktop (sidebar, topbar, KPIs, grids, galeria, índice)
│   └── tv.css                # modo TV (canvas 1920×1080, topbar, KPIs, ticket, alerta, controles)
└── assets/icons/             # 42 SVG no estilo do GCC (24×24, stroke 2, round)
```

## 3. Componentes principais

**Desktop (app.css + base.css)**

- `.sidebar` — grupos `PRINCIPAL / OPERAÇÃO / GESTÃO / INTEGRAÇÕES / ADMINISTRAÇÃO`, item ativo em azul
- `.topbar` — `conn` (bolinha de conexão), busca com `Ctrl+K`, usuário, notificações, sair
- `.page-head` — eyebrow + título + subtítulo + ações (Atualizar, Ativar modo TV)
- `.kpi` / `.kpi-grid` — cartões numéricos com ícone colorido
- `.panel` + `.bar-row` — painéis com barras horizontais (`__track` / `__fill`)
- `.rank-list` — rankings com medidor (`__meter`)
- `.table` / `.table-wrap` / `.pagination` — tabelas e paginação
- `.state` (`--empty`, `--error`, `--offline`) + `.spinner` + `.skeleton` — estados de carregamento/vazio/erro
- `.banner--warning | --error | --info | --offline`, `.badge--blue | --green | --yellow | --red | --neutral`
- `.tag`, `.chip`, `.dot`, `.conn`, `.btn` (`--yellow`, `--primary`, `--sm`, `--ghost`)

**Modo TV (tv.css)**

- `.tv-canvas` — canvas fixo `1920×1080`; em janelas menores é reduzido com `zoom`
  (0.75 / 0.6 / 0.5 / 0.375). A resolução de projeto continua 1920×1080.
- `.tv-topbar` — logotipo, `Painel Operacional / Central de T.I.`, indicador de painel,
  conexão, última atualização, hora atual, `Tela cheia`
- `.tv-kpi` / `.tv-kpi-grid` — KPIs grandes
- `.tv-note-strip` — faixa horizontal de “atenção necessária”
- `.tv-bar-row`, `.tv-list__item`, `.tv-panel--fill` — barras e listas do painel
- `.tv-ticket` — último chamado em evidência (sala em destaque, chip de equipamento,
  resumo, fatos abertura/tempo/status, botão **Aceitar**)
- `.tv-side` / `.tv-stat` — chamados abertos, sala com mais chamados, dispositivo com mais
  chamados, última atualização
- `.tv-controls` — contagem da próxima troca (anel + `07`), `Pausar rotação`,
  `Trocar painel`, `Ativar som`, `Sair do modo TV`
- `.tv-alert` — alerta de chamado novo (flag, sala, equipamento, chip de **alerta sonoro**,
  contagem `Some em 12`, **Aceitar**), sempre **em fluxo** (nunca cobre o painel)
- `.tv-queue` — fila de chamados aguardando
- `.tv-body--alert` — variante compacta usada quando o alerta está ativo
- `.tv-offline` — estado sem conexão (raro de representar aqui)

## 4. Tokens (tokens.css)

| Grupo | Valores |
|---|---|
| Fundo | `--navy-950 #060b17`, `--navy-900 #0a1120`, `--navy-850 #0d1729` (`--surface`), `--navy-800`, `--navy-750` |
| Linhas | `--line #1d2c4a`, `--line-strong #2b3f66`, `--line-soft #16233c` |
| Azul | `--blue #2563eb`, `--blue-500 #3b82f6`, `--blue-300 #93b4ff`, `--blue-soft` |
| Amarelo | `--yellow #facc15`, `--yellow-600`, `--yellow-soft` |
| Status | `--green #22c55e`, `--red #ef4444`, `--orange #f59e0b` (+ `*-soft`) |
| Texto | `--text #e9eefb`, `--text-2 #a7b6d4`, `--text-3 #7186ad`, `--text-inverse` |
| Fonte | `--font DM Sans`, `--font-mono JetBrains Mono` (mesmas do GCC) |
| Escala | `--fs-xs 10px` … `--fs-6xl 40px`; `--s-1 4px` … `--s-16 64px` |
| Raio | `--r-sm 6px`, `--r-md 8px`, `--r-pill` |

## 5. Ícones

42 SVGs em `assets/icons/` no mesmo padrão do GCC (`24×24`, `stroke-width="2"`, round, `fill="none"`):

- **Copiados (26):** dashboard, computer, chromebook, projector, printer, tickets, assistance,
  analytics, reports, audit, notifications, suppliers, integrations, settings, refresh, logout,
  user, success, warning, error, info, cart, search, arrow-right, plus, calendar
- **Novos (16):** `tv`, `volume`, `volume-off`, `pause`, `skip-forward`, `expand`, `minimize`,
  `exit-tv`, `clock`, `wifi`, `wifi-off`, `room`, `bell`, `check`, `queue`, `inbox`

Uso: `<span class="gcc-icon gcc-icon--sm"><img src="assets/icons/tv.svg" alt="" /></span>`
(com `--xs … --2xl` para variações de tamanho).

O logotipo é lido de `Frontend/assets/branding/logo/logotextoesquerdabranco.png` (só leitura).

## 6. Dados exibidos (validação real de 25/09/2026)

- **Ativos:** sincronização real confirmada com `558` registros: `71` computadores,
  `447` Chromebooks, `32` projetores e `8` impressoras.
- **Chamados:** consulta real confirmada com o chamado `#78 / L-0009`, identificado como
  `Projetor — Sala 16`. No recorte validado havia `1` chamado de sala, ainda aberto e sem
  ativo patrimonial vinculado.
- Estados/tipos seguem os vocabulários do próprio GLPI usados no GCC
  (`em uso`, `comodato`, `devolvido`, `substituído`, `baixa`, `desconhecido`; `Computer`, `Printer`).

Os valores operacionais do protótipo correspondem a essa validação. Filtros e estados sem
valor disponível mostram somente a estrutura visual, sem afirmar uma contagem.

## 7. Comportamento previsto do Modo TV (para a implementação real)

O protótipo é estático; as animações/estados estão representados visualmente. Na implementação:

1. Rotação automática entre painéis com contagem regressiva visível (anel + segundos).
2. Novo chamado interrompe a rotação, exibe `.tv-alert` por **15 s ou até o aceite**,
   toca o alerta sonoro (indicado pelo chip) e **leva a rotação para o painel de chamados**.
3. Vários chamados simultâneos entram em fila (`.tv-queue`), exibidos um por vez.
4. O alerta **não pode esconder** sala, equipamento, resumo, status e botão Aceitar.
5. Manter topbar com logotipo, conexão, última atualização e hora; esconder sidebar,
   pesquisa, usuário, robô, notificações e administrações.
6. Atualizar chamados a cada **1 minuto**. O painel de ativos pode manter o intervalo de
   **5 minutos**.

## 8. Arquivos de produção a alterar (quando sair do protótipo)

| Arquivo | O que muda |
|---|---|
| `Frontend/index.html` | novas telas/links do Modo TV, estrutura das seções |
| `Frontend/css/design-system.css` | tokens dark (cores, raios, tipografia) |
| `Frontend/css/room-tickets.css` | dashboard de chamados das salas |
| `Frontend/css/icons/*` (ou `icons.css`) | 16 novos ícones (tv, volume, pause, …) |
| `Frontend/javascript/dashboard_ui.js` | KPIs, barras, atenção/status, estado de carregamento |
| `Frontend/javascript/dashboard.config.js` | rótulos/limites/máximos exibidos |
| `Frontend/javascript/room-tickets.js` | filtros, resumo, rankings, tabela, paginação |
| `Frontend/javascript/sidebar.js` | grupos e itens do menu |
| `Frontend/javascript/app.js` | busca, conexão, notificações, preferências |
| `Frontend/javascript/ui_render.js` | renderização reutilizada das telas novas |
| `Frontend/assets/branding/logo/*` | (só leitura hoje) logo branco usado no topo da TV |

Ainda **não** existe módulo de Modo TV em produção: será preciso algo como
`Frontend/javascript/tv_mode.js` (rotação, contagem, alerta, fila, som, sair do modo TV)
e `Frontend/tv-*.html` (ou rotas equivalentes) baseados em `tv-ativos/tv-chamados/tv-alerta.html`.

## 9. Próximos passos sugeridos

1. Revisar a direção visual com a equipe (fundo marinho + azul + amarelo, raio 8px).
2. Portar os tokens para `design-system.css` e trocar as cores do GCC.
3. Implementar o Modo TV com JS real (rotação/alerta/fila/som) a partir de `tv.css`.
4. Adicionar testes visuais (screenshots 1920×1080) para regressão do modo TV.
