FROM php:8.3-cli

# PDO + PostgreSQL driver (and tooling for composer installs).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev unzip git \
    && docker-php-ext-install pdo pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2.6 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Install PHP dependencies first for better layer caching.
COPY composer.json composer.lock ./
RUN composer install --no-interaction --no-scripts --no-progress --prefer-dist

COPY . .

EXPOSE 4000

# Laravel's built-in dev server. The compose bind-mount keeps code hot.
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=4000"]
