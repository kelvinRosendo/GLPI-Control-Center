/**
 * GLPI Control Center - glpi_client.js
 * -----------------------------------------------------------------------------
 * Cliente JavaScript que busca dados reais do backend PHP.
 *
 * Cada método faz fetch() para o endpoint correspondente e retorna os dados
 * já no formato que o frontend espera (mesmo formato dos antigos dados DEMO).
 *
 * Base URL configurável: window.CONFIG.backendUrl (definido em data.js)
 */

window.GlpiClient = {

  /**
   * URL base do backend PHP.
   * Ajuste em data.js (CONFIG.backendUrl) conforme o ambiente.
   */
  get baseUrl() {
    return (window.CONFIG?.backendUrl ?? 'http://localhost:8080').replace(/\/$/, '');
  },

  /**
   * Faz fetch genérico e retorna os dados ou lança erro.
   */
  async _fetch(path) {
    const res = await fetch(this.baseUrl + path);
    if (!res.ok) {
      throw new Error(`Backend retornou HTTP ${res.status} em ${path}`);
    }
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Erro desconhecido no backend');
    }
    return json;
  },

  // ──────────────────────────────────────────────────────────────────────────

  async fetchComputadores() {
    const json = await this._fetch('/api/assets/computers');
    return json.data ?? [];
  },

  async fetchChromebooksGeekiees() {
    const json = await this._fetch('/api/assets/chromebooks-geekiees');
    return json.data ?? [];
  },

  /**
   * Retorna objeto no formato: { "Carrinho 1": [...], "Carrinho 2": [...], ... }
   */
  async fetchChromebooksApoio() {
    const json = await this._fetch('/api/assets/chromebooks-apoio');
    return json.data ?? {};
  },

  async fetchProjetores() {
    const json = await this._fetch('/api/assets/projetores');
    return json.data ?? [];
  },

  async fetchImpressoras() {
    const json = await this._fetch('/api/assets/impressoras');
    return json.data ?? [];
  },

  async fetchTickets() {
    const json = await this._fetch('/api/tickets');
    return json.data ?? [];
  },

  /**
   * Carrega TODOS os dados em paralelo e popula window.DATA.
   * Chamado pelo App na inicialização após o login.
   *
   * Retorna { ok: true } ou { ok: false, errors: [...] }
   */
  async loadAll() {
    const results = await Promise.allSettled([
      this.fetchComputadores(),
      this.fetchChromebooksGeekiees(),
      this.fetchChromebooksApoio(),
      this.fetchProjetores(),
      this.fetchImpressoras(),
    ]);

    const errors = [];

    const [comp, geekiees, apoio, proj, impr] = results.map((r, i) => {
      if (r.status === 'rejected') {
        const names = ['computadores', 'geekiees', 'apoio', 'projetores', 'impressoras'];
        errors.push(`${names[i]}: ${r.reason?.message ?? r.reason}`);
        return null;
      }
      return r.value;
    });

    // Popula DATA com o que conseguiu buscar (fallback para array vazio)
    window.DATA = {
      computadores: comp ?? [],
      chromebooksGeekiees: geekiees ?? [],
      chromebooksApoio: apoio ?? {},
      projetores: proj ?? [],
      impressoras: impr ?? [],
    };

    return errors.length === 0
      ? { ok: true }
      : { ok: false, errors };
  },
};