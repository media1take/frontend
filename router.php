<?php
// router.php — router for PHP built-in web server.
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$root = __DIR__;
$file = $root . $uri;
// If the request is for an existing file, serve it directly.
if ($uri !== '/' && file_exists($file)) {
    return false;
}
// Fallback order for single-page or static site entry points.
$fallbacks = [
    $root . '/home/index.html',
    $root . '/index.html',
    $root . '/video/video.html',
    $root . '/debug.html',
];
foreach ($fallbacks as $f) {
    if (file_exists($f)) {
        $html = file_get_contents($f);
        $base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
        if ($base === '') { $base = '/'; }
        if (stripos($html, '<base') === false) {
            $html = preg_replace('/<head([^>]*)>/i', '<head$1><base href="' . $base . '">', $html, 1);
        }
        echo $html;
        exit;
    }
}
http_response_code(404);
echo "404 Not Found";
