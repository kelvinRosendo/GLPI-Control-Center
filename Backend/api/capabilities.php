<?php
/**
 * api/capabilities.php
 * -----------------------------------------------------------------------------
 * Endpoint: GET /api/capabilities
 *
 * Retorna o contrato de capacidades do backend.
 */

declare(strict_types=1);

require_once __DIR__ . '/services/CapabilitiesService.php';

Responde::ok([
  'data' => CapabilitiesService::getContract(),
]);
