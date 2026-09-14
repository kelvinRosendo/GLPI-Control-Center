<?php
declare(strict_types=1);
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);

require_once __DIR__ . '/utils/env.php';
require_once __DIR__ . '/utils/responde.php';
require_once __DIR__ . '/client.php';

Env::load(__DIR__ . '/../.env');
Env::load(__DIR__ . '/../.env.local', true);
$config = require __DIR__ . '/../config/config.php';

$glpi = new GlpiClient($config['glpi'] ?? []);
$session = $glpi->initSession();

$result = $glpi->getAllWithParams('/Computer', $session, ['expand_dropdowns' => 'true'], 500);
$glpi->killSession($session);

$items = $result['items'];
$names = [];
$groups = [];
$computers = [];

foreach ($items as $c) {
    $nome = $c['name'] ?? '';
    $names[] = $nome;

    $g = $c['groups_id'] ?? null;
    $gName = '';
    if (is_array($g)) $gName = trim($g['name'] ?? '');
    elseif (is_string($g)) $gName = trim($g);
    if ($gName) $groups[$gName] = ($groups[$gName] ?? 0) + 1;

    $computers[] = [
        'id' => $c['id'] ?? null,
        'name' => $nome,
        'group' => $gName,
        'state' => $c['states_id'] ?? null,
    ];
}

$patterns = [];
foreach ($names as $n) {
    $n = trim($n);
    if (preg_match('/^Chrome\s+G-/i', $n)) $patterns['Chrome G- (Alunos)']++;
    elseif (preg_match('/^Chrome-.*EDU/i', $n)) $patterns['Chrome-..EDU (Exibição)']++;
    elseif (preg_match('/^Chrome-/i', $n)) $patterns['Chrome- (Apoio)']++;
    elseif (preg_match('/^CS-/i', $n)) $patterns['CS- (Computadores)']++;
    elseif (preg_match('/^CO-/i', $n)) $patterns['CO- (Computadores)']++;
    elseif (preg_match('/^Projetor/i', $n)) $patterns['Projetor']++;
    elseif (preg_match('/^Chrome/i', $n)) $patterns['Chrome (genérico)']++;
    else $patterns['Outros']++;
}

echo "=== NAME PATTERNS ===\n";
arsort($patterns);
foreach ($patterns as $p => $c) echo "  $p: $c\n";

echo "\n=== ALL NAMES (sorted) ===\n";
sort($names);
foreach ($names as $n) echo "  $n\n";

echo "\n=== GROUPS ===\n";
arsort($groups);
foreach ($groups as $g => $c) echo "  $g: $c\n";

echo "\nTotal: " . count($names) . "\n";
