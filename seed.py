from app import app, db, Restaurant

DATA = [
    ("Basil & Brine", "Italian", 2, 4.5, "Columbus", ["cozy", "date-night"], ["vegetarian"]),
    ("Ember Ramen", "Japanese", 2, 4.3, "Columbus", ["lively", "casual"], ["vegan"]),
    ("Saffron Table", "Indian", 2, 4.6, "Columbus", ["cozy", "family"], ["vegan", "gluten-free"]),
    ("The Gilded Fork", "French", 4, 4.8, "Columbus", ["date-night", "quiet"], []),
    ("Taco Orbit", "Mexican", 1, 4.1, "Columbus", ["lively", "casual"], ["vegetarian"]),
    ("Green Kettle", "American", 2, 4.0, "Columbus", ["casual", "family"], ["vegan", "gluten-free"]),
]

with app.app_context():
    db.create_all()
    if not Restaurant.query.first():
        for n, c, p, r, city, v, d in DATA:
            db.session.add(Restaurant(name=n, cuisine=c, price_level=p, rating=r, city=city, vibes=v, dietary=d))
        db.session.commit()
    print("Seeded.")
