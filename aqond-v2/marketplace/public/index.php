<?php
header('Content-Type: application/json');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/health' || $path === '/health/') {
    echo json_encode(['ok' => true, 'service' => 'marketplace-web', 'bagisto' => 'placeholder']);
    exit;
}

if ($path === '/internal/sync-product' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $secret = getenv('BAGISTO_WEBHOOK_SECRET') ?: '';
    $hdr = $_SERVER['HTTP_X_BAGISTO_SYNC_SECRET'] ?? '';
    if ($secret && !hash_equals($secret, $hdr)) {
        http_response_code(403);
        echo json_encode(['error' => 'invalid_secret']);
        exit;
    }
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    // Idempotent sync stub — replace with Bagisto product API
    echo json_encode(['ok' => true, 'synced' => true, 'product' => $body['title'] ?? 'unknown']);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'not_found', 'hint' => 'Run scripts/install-bagisto.sh for full Bagisto']);
