<?php
declare(strict_types=1);
$testRoot = sys_get_temp_dir() . '/gcc-offline-' . bin2hex(random_bytes(12));
mkdir($testRoot, 0700, true);
define('GCC_TEST_BACKEND', $testRoot);
$copyTestTree = static function (string $source, string $target) use (&$copyTestTree): void {
    mkdir($target, 0700, true);
    foreach (new DirectoryIterator($source) as $entry) {
        if ($entry->isDot() || $entry->isLink()) continue;
        $out = $target . '/' . $entry->getFilename();
        if ($entry->isDir()) $copyTestTree($entry->getPathname(), $out);
        else copy($entry->getPathname(), $out);
    }
};
foreach (['api', 'config'] as $dir) $copyTestTree(__DIR__ . '/../' . $dir, $testRoot . '/' . $dir);
mkdir($testRoot . '/data/cache', 0700, true);
mkdir($testRoot . '/logs', 0700, true);
register_shutdown_function(static function () use ($testRoot): void {
    $entries = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($testRoot, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($entries as $entry) {
        if ($entry->isDir() && !$entry->isLink()) rmdir($entry->getPathname());
        else unlink($entry->getPathname());
    }
    rmdir($testRoot);
});
