<?php
// index.php — front controller for Apache/PHP and fallback for static files.
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$root = __DIR__;
$requested = $root . $uri;

// Prevent directory traversal
if (strpos(realpath($requested) ?: '', $root) !== 0) {
    http_response_code(400);
    echo "400 Bad Request";
    exit;
}

// If file exists, serve it (useful when PHP is handling requests directly).
if ($uri !== '/' && file_exists($requested) && is_file($requested)) {
    $mime = mime_content_type($requested) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    readfile($requested);
    exit;
}

// Route map: clean paths -> HTML entry files
$routes = [
    '/' => '/home/index.html',
    '/home' => '/home/index.html',
    '/chat' => '/chat/chat.html',
    '/video' => '/video/video.html',
    '/blog' => '/blog/blog.html',
    '/community' => '/community/community.html',
];

foreach ($routes as $path => $file) {
    if ($uri === $path || strpos($uri, $path . '/') === 0) {
        $f = $root . $file;
        if (file_exists($f)) {
            header('Content-Type: text/html; charset=utf-8');
            $html = file_get_contents($f);
            // compute base href based on where the app is mounted
            $base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
            if ($base === '') { $base = '/'; }
            // inject <base> into the <head> tag if not present
            if (stripos($html, '<base') === false) {
                $html = preg_replace('/<head([^>]*)>/i', '<head$1><base href="' . $base . '">', $html, 1);
            }
            echo $html;
            exit;
        }
    }
}

// Fallback to home/index.html if available
$fallback = $root . '/home/index.html';
if (file_exists($fallback)) {
    header('Content-Type: text/html; charset=utf-8');
    $html = file_get_contents($fallback);
    $base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
    if ($base === '') { $base = '/'; }
    if (stripos($html, '<base') === false) {
        $html = preg_replace('/<head([^>]*)>/i', '<head$1><base href="' . $base . '">', $html, 1);
    }
    echo $html;
    exit;
}

http_response_code(404);
echo "404 Not Found";
