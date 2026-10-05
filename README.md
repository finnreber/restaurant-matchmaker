# Restaurant Matchmaker

## Run locally
    docker compose up -d db
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env
    python seed.py
    flask --app app run --debug      # http://localhost:5000

## API
- GET  /api/restaurants?city=&cuisine=&page=
- POST /api/restaurants
- POST /api/match   {city, cuisines[], vibes[], dietary[], max_price}
- GET  /health

## AWS scaling path
1. Now: Docker image -> ECR -> AWS App Runner (or ECS Fargate) + RDS PostgreSQL.
2. Put DATABASE_URL in Secrets Manager; run RDS in private subnets.
3. ECS Fargate behind an ALB (/health), autoscale on CPU; RDS Multi-AZ + read replica.
4. Serve /static via S3 + CloudFront; add ElastiCache (Redis) for hot match queries.
5. CI/CD: GitHub Actions -> ECR -> ECS. Add Flask-Migrate (Alembic) before schema changes.
