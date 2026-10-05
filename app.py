import os
from dotenv import load_dotenv
from flask import Flask, jsonify, request, render_template
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import ARRAY

load_dotenv()
db = SQLAlchemy()


class Restaurant(db.Model):
    __tablename__ = "restaurants"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    cuisine = db.Column(db.String(50), nullable=False, index=True)
    price_level = db.Column(db.SmallInteger, nullable=False, index=True)  # 1-4
    rating = db.Column(db.Numeric(2, 1), default=0)
    city = db.Column(db.String(80), nullable=False, index=True)
    vibes = db.Column(ARRAY(db.String), default=list)      # e.g. cozy, lively
    dietary = db.Column(ARRAY(db.String), default=list)    # e.g. vegan, gluten-free

    def to_dict(self, score=None):
        d = {"id": self.id, "name": self.name, "cuisine": self.cuisine,
             "price_level": self.price_level, "rating": float(self.rating or 0),
             "city": self.city, "vibes": self.vibes or [], "dietary": self.dietary or []}
        if score is not None:
            d["score"] = round(score, 2)
        return d


def score(r, p):
    """Higher = better match. Dietary needs are a hard filter (handled by caller)."""
    s = float(r.rating or 0) * 0.5
    if p.get("cuisines") and r.cuisine in p["cuisines"]:
        s += 3
    if p.get("max_price"):
        s += 2 if r.price_level <= p["max_price"] else -2
    s += len(set(r.vibes or []) & set(p.get("vibes", [])))
    return s


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["DATABASE_URL"]
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True, "pool_size": 5}
    db.init_app(app)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():  # used by AWS load balancer health checks
        return {"status": "ok"}

    @app.get("/api/restaurants")
    def list_restaurants():
        page = request.args.get("page", 1, type=int)
        q = Restaurant.query
        if city := request.args.get("city"):
            q = q.filter(Restaurant.city.ilike(city))
        if cuisine := request.args.get("cuisine"):
            q = q.filter(Restaurant.cuisine.ilike(cuisine))
        p = q.order_by(Restaurant.rating.desc()).paginate(page=page, per_page=20, error_out=False)
        return jsonify(items=[r.to_dict() for r in p.items], page=page, pages=p.pages)

    @app.post("/api/restaurants")
    def create_restaurant():
        data = request.get_json(silent=True) or {}
        missing = [k for k in ("name", "cuisine", "price_level", "city") if k not in data]
        if missing:
            return jsonify(error=f"Missing fields: {', '.join(missing)}"), 400
        r = Restaurant(**{k: data[k] for k in ("name", "cuisine", "price_level", "city",
                                              "rating", "vibes", "dietary") if k in data})
        db.session.add(r)
        db.session.commit()
        return jsonify(r.to_dict()), 201

    @app.post("/api/match")
    def match():
        p = request.get_json(silent=True) or {}
        if not p.get("city"):
            return jsonify(error="city is required"), 400
        q = Restaurant.query.filter(Restaurant.city.ilike(p["city"]))
        if p.get("dietary"):
            q = q.filter(Restaurant.dietary.contains(p["dietary"]))  # must satisfy all
        ranked = sorted(q.all(), key=lambda r: score(r, p), reverse=True)[:10]
        return jsonify(matches=[r.to_dict(score(r, p)) for r in ranked])

    return app


app = create_app()
