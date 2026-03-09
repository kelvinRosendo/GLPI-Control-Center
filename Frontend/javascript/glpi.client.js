/**
 * glpi.client.js — Cliente HTTP do Frontend
 * -----------------------------------------------------------------------------
 * Responsável por buscar dados reais do backend PHP.
 * O backend fica em localhost:8080 e é ele quem fala com o GLPI de verdade.
 *
 * Nunca chamamos o GLPI diretamente daqui — sempre passamos pelo backend.
 */

window.GlpiClient = {

  // Endereço do backend PHP
  baseUrl: "http://localhost:8080",

  /**
   * Busca todos os computadores do GLPI via backend.
   * Retorna array no formato que o painel já espera.
   */
  async fetchComputers() {
    const res = await fetch(`${this.baseUrl}/api/assets/computers`);
    const json = await res.json();

    if (!json.ok) {
      console.error("[GlpiClient] Erro ao buscar computadores:", json.error);
      return [];
    }

    return json.data;
  },
};