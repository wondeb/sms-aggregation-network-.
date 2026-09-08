#!/bin/bash
set -e

echo "🚀 SMS Aggregation Network - Setup"
echo "=================================="

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Install Docker Compose plugin."
    exit 1
fi

# Create .env if missing
if [ ! -f .env ]; then
    echo "⚠️  .env file missing. Creating from template..."
    cat > .env <<'EOF'
DB_PASSWORD=ChangeMe_DB_2024!
REDIS_PASSWORD=ChangeMe_Redis_2024!
ADMIN_PASSWORD=ChangeMe_Admin_2024!
FIVESIM_API_KEY=your_fivesim_key_here
HEROSMS_API_KEY=your_herosms_key_here
EOF
    echo "✅ Created .env — EDIT THIS FILE BEFORE DEPLOYING!"
fi

# Build and start
echo "📦 Building containers..."
docker-compose build

echo "🗄️  Starting database..."
docker-compose up -d postgres redis
sleep 10

echo "📐 Running migrations..."
docker-compose exec -T postgres psql -U sms_admin -d sms_network \
    < migrations/001_initial_schema.sql

echo "🚀 Starting application services..."
docker-compose up -d

echo ""
echo "✅ Deployment complete!"
echo "   Master API:    http://localhost:3000"
echo "   Admin Panel:   http://localhost:8080"
echo "   Nginx:         http://localhost"
echo ""
echo "⚠️  Remember to change all passwords in .env!"
