<?php
// Viewer-token vectors made by the Developer API's own code: Validate::string (the trim and the
// 1-64 byte rule of POST /v1/videos/{id}/playback-tokens) and Wire\ViewerToken::mint, with
// time() pinned so the output is reproducible. Every token names its video (required since
// 2026-11-22). Usage, from a checkout of Wolvy-APIs:
//   php test/fixtures/viewer-token-vectors.php <Wolvy-APIs> > test/fixtures/viewer-token-vectors.json
namespace Wolvy\Api\Wire {
    function time(): int { return $GLOBALS['PINNED_NOW']; }
}
namespace {

    require $argv[1] . '/app/src/autoload.php';
    use Wolvy\Api\Validate;
    use Wolvy\Api\Wire\ViewerToken;

    $cases = [
        // The docs' published vector (docs.wolvy.net/viewer-tokens/#test-vectors).
        ['secret' => 'd80d15d09b7c0e56b4d787f6a212ed8bf8d53c761b6df521278f030cb12a7781', 'viewer_id' => 'user-8813', 'now' => 1789996400, 'ttl' => 3600, 'video' => 'a1b2c3d4e5f60718293a'],
    ];
    $secret = 'b2c5d0a7e44f1c9e0d6a3f8b7e1c2d4a5f6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d';
    $ids = [
        'a/b', 'élève', "\u{1F600} emoji", 'Ünïcödé/日本', "  padded \t\n", 'he said "hi" \\ ok',
        "tab\there", '<script>&amp;', "del\x7fchar", "nul\x01ctl\x1f", "\u{00A0}nbsp\u{00A0}",
        "\u{2028}line\u{2029}", str_repeat('x', 64), str_repeat('é', 32), 'sara@example.com',
    ];
    foreach ($ids as $i => $id) {
        $cases[] = ['secret' => $secret, 'viewer_id' => $id, 'now' => 1795000000 + $i, 'ttl' => [60, 3600, 21600, 86400][$i % 4],
            'video' => ['a1b2c3d4e5f60718293a', 'Lesson_1-intro', 'x', str_repeat('Z9', 32)][$i % 4]];
    }
    $out = [];
    foreach ($cases as $c) {
        $vid = Validate::string(['viewer_id' => $c['viewer_id']], 'viewer_id', required: true, max: 64, min: 1);
        $GLOBALS['PINNED_NOW'] = $c['now'];
        $token = ViewerToken::mint($vid, $c['secret'], $c['ttl'], $c['video']);
        $out[] = $c + ['vt' => $token['vt'], 'exp' => $token['expires_at']];
    }
    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
}
