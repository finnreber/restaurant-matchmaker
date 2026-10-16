import math
import os
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import ARRAY

import places

load_dotenv()
db = SQLAlchemy()


class Profile(db.Model):
    """Saved defaults for each of the two people ('a' and 'b')."""
    slot = db.Column(db.String(1), primary_key=True)
    name = db.Column(db.String(40), nullable=False)
    cuisines = db.Column(ARRAY(db.String), default=list)
    dietary = db.Column(ARRAY(db.String), default=list)
    max_price = db.Column(db.SmallInteger, default=2)


class Dinner(db.Model):
    """Places you actually chose. Stores place_id + name only (see README on Google's terms)."""
    id = db.Column(db.Integer, primary_key=True)
    place_id = db.Column(db.String(80), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    chosen_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    rating_a = db.Column(db.SmallInteger)
    rating_b = db.Column(db.SmallInteger)


class ApiUsage(db.Model):
    """Counts Google calls per month so a hard cap protects the free allowance."""
    month = db.Column(db.String(7), primary_key=True)
    calls = db.Column(db.Integer, default=0, nullable=False)


def km(a_lat, a_lng, b_lat, b_lng):
    p = math.pi / 180
    h = (0.5 - math.cos((b_lat - a_lat) * p) / 2
         + math.cos(a_lat * p) * math.cos(b_lat * p) * (1 - math.cos((b_lng - a_lng) * p)) / 2)
    return 12742 * math.asin(math.sqrt(h))


def person_score(place, person, cuisines_hit):
    s = 3 if {c.lower() for c in person["cuisines"]} & cuisines_hit else 0
    if place["price"]:
        s += 2 if place["price"] <= person["max_price"] else -3
    s += (place["rating"] or 3.5) / 5 * 2
    return s


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["DATABASE_URL"]
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
    db.init_app(app)
    Migrate(app, db)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/profiles")
    def get_profiles():
        return jsonify({p.slot: {"name": p.name, "cuisines": p.cuisines, "dietary": p.dietary,
                                 "max_price": p.max_price} for p in Profile.query.all()})

    @app.put("/api/profiles/<slot>")
    def save_profile(slot):
        if slot not in ("a", "b"):
            return jsonify(error="slot must be a or b"), 400
        d = request.get_json(silent=True) or {}
        p = db.session.get(Profile, slot) or Profile(slot=slot)
        p.name = (d.get("name") or slot.upper())[:40]
        p.cuisines, p.dietary = d.get("cuisines", []), d.get("dietary", [])
        p.max_price = int(d.get("max_price", 2))
        db.session.add(p)
        db.session.commit()
        return jsonify(ok=True)

    @app.post("/api/suggest")
    def suggest():
        d = request.get_json(silent=True) or {}
        people, area = d.get("people", []), (d.get("area") or "").strip()
        lat, lng = d.get("lat"), d.get("lng")
        if len(people) != 2 or not (area or lat is not None):
            return jsonify(error="Need two people and an area or location"), 400

        cap = int(os.environ.get("MONTHLY_CALL_CAP", 150))
        month = datetime.utcnow().strftime("%Y-%m")
        usage = db.session.get(ApiUsage, month) or ApiUsage(month=month, calls=0)
        if usage.calls >= cap:
            return jsonify(error=f"Monthly Google call cap reached ({cap}). Raise MONTHLY_CALL_CAP to continue."), 429

        wanted = list(dict.fromkeys(c.lower() for p in people for c in p["cuisines"]))
        diet = " ".join(dict.fromkeys(x for p in people for x in p["dietary"]))
        query = f"{diet} {' or '.join(wanted)} restaurant".strip() + (f" in {area}" if area else "")
        radius_km = float(d.get("radius_km", 8))
        usage.calls += 1  # exactly ONE Google call per search, counted before it is made
        db.session.add(usage)
        db.session.commit()
        try:
            results = places.search(query, lat, lng, radius_km * 1000)
        except requests.RequestException as e:
            code = getattr(e.response, "status_code", "network")
            return jsonify(error=f"Google request failed ({code}). Check your key, billing and API enablement."), 502

        recent = {x.place_id for x in Dinner.query.filter(
            Dinner.chosen_at > datetime.utcnow() - timedelta(days=45))}
        max_price = min(p["max_price"] for p in people)
        out = []
        for pl in results:
            if pl["place_id"] in recent or (pl["price"] and pl["price"] > max_price + 1):
                continue
            if lat is not None and pl["lat"] is not None:  # distance factor
                pl["distance_km"] = round(km(lat, lng, pl["lat"], pl["lng"]), 1)
                if pl["distance_km"] > radius_km:
                    continue
            hit = {c for c in wanted if c in f"{pl['name']} {pl['type']}".lower()}
            a, b = (person_score(pl, p, hit) for p in people)
            total = a + b + min(a, b) - (pl.get("distance_km") or 0) * 0.3
            pl["cuisines"] = sorted(hit)
            pl["score"] = round(total, 2)
            out.append(pl)
        out.sort(key=lambda x: x["score"], reverse=True)
        return jsonify(matches=out[:6], calls_left=cap - usage.calls)

    @app.post("/api/dinners")
    def save_dinner():
        d = request.get_json(silent=True) or {}
        if not d.get("place_id") or not d.get("name"):
            return jsonify(error="place_id and name required"), 400
        db.session.add(Dinner(place_id=d["place_id"], name=d["name"]))
        db.session.commit()
        return jsonify(ok=True), 201

    return app


app = create_app()
