---
title: "Pinning Your PHP Version on Dokploy (Nixpacks Is Stuck on PHP 8.4.2)"
seoTitle: "Dokploy PHP Version: Get Off PHP 8.4.2 and Patch PHP2Shell"
description: "Nixpacks on Dokploy installs PHP 8.4.2 no matter what composer.json says, which leaves apps open to the October 2026 PHP2Shell flaws. How to check your version and move to a patched one with Railpack or a Dockerfile."
date: "2026-11-03"
keywords: "dokploy php version, nixpacks php version, dokploy php 8.4, php2shell, railpack php, dokploy dockerfile php"
---

If you deploy a PHP app on Dokploy with the default Nixpacks build, check which PHP version it's actually running. A [recent support thread](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1562506146969952336) found that Nixpacks installs **PHP 8.4.2** for any app that asks for PHP 8.4, and there's no setting to change that. Since October 21, 2026, that's a serious problem.

## Why this matters now

On October 21, 2026, PHP shipped emergency fixes for two critical flaws nicknamed **PHP2Shell**, CVE-2026-109618 and CVE-2026-109619. They allow unauthenticated remote code execution in the PHP runtime itself, not in a specific app, and exploitation attempts were seen the same day ([The Hacker News](https://thehackernews.com/2026/10/php-issues-emergency-patches-for-two.html), [Tenable FAQ](https://www.tenable.com/blog/php2shell-cve-2026-109618-cve-2026-109619-frequently-asked-questions-about-critical-php-remote)).

The fixed versions are:

| PHP branch | Fixed in |
|---|---|
| 8.5 | 8.5.12 |
| 8.4 | 8.4.27 |
| 8.3 | 8.3.36 |
| 8.2 | 8.2.35 |

PHP 8.4.2 is far below 8.4.27.

## Why Nixpacks can't fix it

Nixpacks reads the PHP version from your `composer.json`, and its [PHP provider docs](https://nixpacks.com/docs/providers/php) list supported versions only down to the minor version: 8.1, 8.2, 8.3 and 8.4. There's no way to ask for a patch release.

A reply in the thread explains what happens in practice: Nixpacks reads `8.4` from `composer.json` and always installs the 8.4.2 build bundled with Nixpacks. Clearing the build cache or tightening the constraint in `composer.json` doesn't change it, and the latest Nixpacks release doesn't either.

So the fix is to stop using Nixpacks for this app. Dokploy offers two good alternatives.

## First, check what you're running

Open the app's terminal in Dokploy, or SSH into the server, and run:

```bash
docker exec <container> php -v
```

If the first line shows anything below the fixed versions above, keep reading.

## Option 1: Switch the build type to Railpack

Railpack is the successor to Nixpacks, and Dokploy supports it as a build type ([Dokploy build types](https://docs.dokploy.com/docs/core/applications/build-type)). Its [PHP docs](https://railpack.com/languages/php) say it also reads the version from `composer.json`, supports PHP 8.2 and above, and defaults to 8.4.

The thread suggests setting the exact version:

```json
{
  "require": {
    "php": "8.4.27"
  }
}
```

Then in Dokploy, open the application, change **Build Type** to **Railpack**, and redeploy. Run `php -v` afterwards to confirm the version you got, because Railpack's docs don't spell out how patch versions are resolved.

Before you switch in production, know what changes:

- **The web server changes.** Railpack runs PHP on [FrankenPHP](https://frankenphp.dev/docs/), configured with a Caddyfile, instead of Nginx with PHP-FPM. Most apps don't notice, but test on a staging copy first.
- **Environment variable names change.** Nixpacks settings like `NIXPACKS_PHP_ROOT_DIR` become Railpack ones like `RAILPACK_PHP_ROOT_DIR`. Extra extensions go in `RAILPACK_PHP_EXTENSIONS`, for example `gd,imagick,redis`.
- **Laravel apps run migrations on start** by default. Set `RAILPACK_SKIP_MIGRATIONS=true` if you don't want that.

Dokploy also lets you pin the Railpack version itself in the application settings, so a future Railpack release doesn't change your build unexpectedly.

## Option 2: Use a Dockerfile with the official PHP image

For full control, build from the official PHP image with the patch version in the tag. This is the approach another member suggested in the thread. A minimal example for an app served from `public/` (Laravel, Symfony and most frameworks):

```dockerfile
FROM php:8.4.27-apache

# Tools Composer needs, plus the PHP extensions your app uses
RUN apt-get update && apt-get install -y --no-install-recommends unzip git \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install pdo_mysql

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Serve from public/
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf \
    && a2enmod rewrite

WORKDIR /var/www/html
COPY . .
RUN composer install --no-dev --optimize-autoloader \
    && chown -R www-data:www-data /var/www/html
```

Commit it, then in Dokploy set **Build Type** to **Dockerfile** and redeploy. Apache listens on port 80, so set the domain's container port to 80. Use `php:8.4.27-fpm` instead if you run Nginx or another server in front of PHP-FPM.

Pinning the full version means you choose when to upgrade. The cost is that you have to come back and bump the tag for the next security release. If you'd rather pick up patches automatically, use `php:8.4-apache` and rebuild regularly with the build cache cleared.

## Which option to pick

- **You want the smallest change:** Railpack. One setting plus `composer.json`, though the switch to FrankenPHP deserves a test run.
- **You want to know exactly what's running:** a Dockerfile. More to maintain, but nothing is hidden.

Either way, do it soon, and check `php -v` after every deploy until you trust the new setup.

## FAQ

### Why does Dokploy install PHP 8.4.2?

Dokploy's default Nixpacks build reads only the minor version, 8.4, from composer.json and installs the PHP 8.4 build bundled with Nixpacks, which is 8.4.2. Nixpacks has no setting for a patch version.

### How do I check the PHP version of a Dokploy app?

Run docker exec followed by the container name and php -v on the server, or run php -v in the app's terminal in Dokploy.

### Which PHP versions fix PHP2Shell?

PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35, released on October 21, 2026, fix CVE-2026-109618 and CVE-2026-109619.

### Is Railpack a drop-in replacement for Nixpacks for PHP?

Mostly, but it serves PHP with FrankenPHP instead of Nginx and PHP-FPM, and its settings use RAILPACK_ instead of NIXPACKS_ prefixes. Test on staging before switching production.

## Sources

- [Dokploy Discord: Nixpacks is deploying PHP 8.4.2](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1562506146969952336)
- [The Hacker News: PHP issues emergency patches for PHP2Shell](https://thehackernews.com/2026/10/php-issues-emergency-patches-for-two.html)
- [Tenable: PHP2Shell FAQ](https://www.tenable.com/blog/php2shell-cve-2026-109618-cve-2026-109619-frequently-asked-questions-about-critical-php-remote)
- [Nixpacks docs: PHP provider](https://nixpacks.com/docs/providers/php)
- [Railpack docs: PHP](https://railpack.com/languages/php)
- [Dokploy docs: Build types](https://docs.dokploy.com/docs/core/applications/build-type)
- [FrankenPHP docs](https://frankenphp.dev/docs/)
- [Official PHP image on Docker Hub](https://hub.docker.com/_/php)
