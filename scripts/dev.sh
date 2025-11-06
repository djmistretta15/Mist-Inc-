#!/bin/bash
set -e

echo "🚀 Starting Mist Backbone Development Environment"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration before continuing!"
    exit 1
fi

# Start infrastructure
echo "🐳 Starting Docker infrastructure (PostgreSQL, Redis)..."
docker-compose up -d postgres redis

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U mist > /dev/null 2>&1; do
    sleep 1
done
echo "✅ PostgreSQL is ready"

# Run migrations
echo "📊 Running database migrations..."
docker-compose exec -T postgres psql -U mist -d mist -f /docker-entrypoint-initdb.d/001_initial_schema.sql || true

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build shared packages
echo "🔨 Building shared packages..."
npm run build --workspace=@mist/types
npm run build --workspace=@mist/event-bus
npm run build --workspace=@mist/engine-sdk

echo ""
echo "✅ Development environment ready!"
echo ""
echo "Next steps:"
echo "  1. npm run dev --workspace=@mist/trust-engine"
echo "  2. npm run dev --workspace=@mist/scheduler"
echo "  3. npm run dev --workspace=gp4u-engine-example"
echo ""
echo "Or run all services with Docker:"
echo "  docker-compose up"
