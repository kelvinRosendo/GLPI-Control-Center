/**
 * GLPI Control Center - glpi.client.js
 * -----------------------------------------------------------------------------
 * Cliente JavaScript para comunicação com o backend PHP.
 */

window.GlpiClient = {
  get baseUrl() {
    return (window.CONFIG?.backendUrl ?? 'http://localhost:8080').replace(/\/$/, '');
  },

  async _fetch(path, options = {}) {
    const config = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    if (options.body !== undefined) {
      config.body = JSON.stringify(options.body);
    }

    const res = await fetch(this.baseUrl + path, config);
    if (!res.ok) {
      throw new Error(`Backend retornou HTTP ${res.status} em ${path}`);
    }

    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Erro desconhecido no backend');
    }

    return json;
  },

  async fetchComputadores() {
    const json = await this._fetch('/api/assets/computers');
    return json.data ?? [];
  },

  async fetchComputerDetails(glpiId) {
    const json = await this._fetch(`/api/assets/computers/${glpiId}`);
    return json.data ?? null;
  },

  async updateComputer(glpiId, input) {
    const json = await this._fetch(`/api/assets/computers/${glpiId}`, {
      method: 'POST',
      body: { input },
    });
    return json.data ?? null;
  },

  async fetchChromebooksGeekiees() {
    const json = await this._fetch('/api/assets/chromebooks-geekiees');
    return json.data ?? [];
  },

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
