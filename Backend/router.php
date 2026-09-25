<?php
// Router para php -S: redireciona /api/* para api/endpoints.php
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = $uri ?: '/';

// Servir arquivos estáticos se existirem
$docRoot = __DIR__;
$fullPath = $docRoot . $path;
if ($path !== '/' && file_exists($fullPath) && is_file($fullPath)) {
    // Deixar php -S servir diretamente
    return false;
}

// Rotear /api/* e /health para endpoints
if (str_starts_with($path, '/api/')) {
    require __DIR__ . '/api/endpoints.php';
    return true;
}

// Fallback para SPA? Retornar 404 JSON
http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['ok'=>false,'error'=>'Rota não encontrada','path'=>$path]);
