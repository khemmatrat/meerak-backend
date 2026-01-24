#!/bin/bash

DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="kyc_system"
DB_USER="postgres"

echo "🚀 Starting database migrations..."

# รัน initial schema
echo "📦 Running 001_initial_schema.sql..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f migrations/001_initial_schema.sql

# รัน optimizations
echo "⚡ Running 002_hybrid_optimizations.sql..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f migrations/002_hybrid_optimizations.sql

# (optional) รัน sample data
# echo "🎯 Running 003_sample_data.sql..."
# psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f migrations/003_sample_data.sql

echo "✅ Migrations completed successfully!"