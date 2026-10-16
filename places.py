"""Thin Google Places API (New) client. Called from the server only; key never reaches the browser."""
import os
import requests

URL = "https://places.googleapis.com/v1/places:searchText"
# The most expensive field in this mask sets the billing SKU (rating/priceLevel = Enterprise).
FIELDS = ",".join(f"places.{f}" for f in (
    "id", "displayName", "rating", "userRatingCount", "priceLevel",
    "formattedAddress", "location", "primaryTypeDisplayName", "photos"))
PRICE = {"PRICE_LEVEL_INEXPENSIVE": 1, "PRICE_LEVEL_MODERATE": 2,
         "PRICE_LEVEL_EXPENSIVE": 3, "PRICE_LEVEL_VERY_EXPENSIVE": 4}


def search(query, lat=None, lng=None, radius_m=5000, limit=10):
    body = {"textQuery": query, "includedType": "restaurant", "pageSize": limit}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng},
                                           "radius": float(min(radius_m, 50000))}}
    r = requests.post(URL, json=body, timeout=15, headers={
        "X-Goog-Api-Key": os.environ["GOOGLE_PLACES_API_KEY"], "X-Goog-FieldMask": FIELDS})
    r.raise_for_status()
    out = []
    for p in r.json().get("places", []):
        loc = p.get("location", {})
        ph = (p.get("photos") or [None])[0]
        photo = {"name": ph["name"], "author": (ph.get("authorAttributions") or [{}])[0].get("displayName", "")} if ph else None
        out.append({"place_id": p["id"], "name": p["displayName"]["text"],
                    "rating": p.get("rating"), "rating_count": p.get("userRatingCount"),
                    "price": PRICE.get(p.get("priceLevel")), "address": p.get("formattedAddress"),
                    "lat": loc.get("latitude"), "lng": loc.get("longitude"),
                    "type": p.get("primaryTypeDisplayName", {}).get("text", ""), "photo": photo})
    return out


def fetch_photo(name, width=480):
    """Server-side photo fetch so the API key never reaches the browser."""
    r = requests.get(f"https://places.googleapis.com/v1/{name}/media", timeout=15,
                     params={"maxWidthPx": width, "key": os.environ["GOOGLE_PLACES_API_KEY"]})
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "image/jpeg")