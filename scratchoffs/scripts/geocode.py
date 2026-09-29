"""Batch geocode public retailer addresses with the US Census geocoder."""
import csv
import io
import json
import pathlib
import urllib.request

ROOT = pathlib.Path("scratchoffs/data")
games = json.loads((ROOT / "games.json").read_text())
retailers = json.loads((ROOT / "retailers.json").read_text())
geo_path = ROOT / "coordinates.json"
coordinates = json.loads(geo_path.read_text()) if geo_path.exists() else {}

def key(address, town):
    return " ".join(address.upper().split()) + "|" + " ".join(town.upper().split())

addresses = {}
for game in games["entries"]:
    for win in game.get("locations", []):
        addresses[key(win["address"], win["town"])] = (win["address"], win["town"], "")
for store in retailers["entries"]:
    addresses[key(store["address"], store["town"])] = (store["address"], store["town"], store.get("zip", ""))

missing = [(k, *v) for k, v in addresses.items() if k not in coordinates]
for offset in range(0, len(missing), 9000):
    batch = missing[offset:offset + 9000]
    buf = io.StringIO()
    writer = csv.writer(buf)
    for i, (_, street, town, zipcode) in enumerate(batch):
        writer.writerow([i, street, town, "NJ", zipcode])
    boundary = "scratchoff-census-batch-boundary"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"benchmark\"\r\n\r\nPublic_AR_Current\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"addressFile\"; filename=\"addresses.csv\"\r\n"
        f"Content-Type: text/csv\r\n\r\n{buf.getvalue()}\r\n--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        "https://geocoding.geo.census.gov/geocoder/locations/addressbatch",
        data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            lines = response.read().decode("utf-8-sig", errors="replace")
        matched = 0
        for row in csv.reader(io.StringIO(lines)):
            # Batch output: ID, input address, match status, match type,
            # matched address, coordinates (longitude,latitude), TIGER ID, side.
            if len(row) < 6 or row[2].strip().lower() != "match":
                continue
            lon, lat = map(float, row[5].strip().split(","))
            if -75.7 < lon < -73.8 and 38.8 < lat < 41.4:
                coordinates[batch[int(row[0])][0]] = [lat, lon]
                matched += 1
        geo_path.write_text(json.dumps(coordinates, separators=(",", ":")))
        print(f"Geocoded {matched}/{len(batch)} new NJ addresses")
    except Exception as exc:
        print(f"Census geocoding unavailable; retained existing coordinates: {exc}")
        break
