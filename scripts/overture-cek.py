"""
Overture Maps'ten Sakarya kutusundaki konut adaylarını çeker.

    pip install duckdb
    python scripts/overture-cek.py              # en güncel sürüm
    python scripts/overture-cek.py 2026-09-23.0 # belirli sürüm

Çıktı `siteleri-derle.mjs`'in önbellek klasörüne (`<tmp>/sultan-osm/overture.json`)
yazılır; derleme betiği dosya varsa OSM listesiyle birleştirir.

Overture'ın bina katmanı Türkiye'de OSM'den geliyor, adres katmanı boş —
yeni bilgi yalnızca mekân (places) katmanında: çoğu Meta kaynaklı işletme
sayfaları. Siteler burada tutarsız kategorilerde duruyor ("historic_site",
"home_developer", "real_estate_agent", kargo dolabı "pudo X Sitesi"…); ad ve
kategoriyle süzüyoruz, il sınırı ve konut dışı adları derleme betiği eliyor.

Veri © Overture Maps Foundation, CDLA-Permissive-2.0 / ODbL.
"""

import json
import os
import sys
import tempfile
import urllib.request

import duckdb

KUTU = "bbox.xmin > 29.96 AND bbox.xmax < 31.02 AND bbox.ymin > 40.29 AND bbox.ymax < 41.36"

# Site sözcüğü içeren adlar yalnızca bu kategorilerde site sayılır; restoran
# "X Evleri", market "Y Sitesi" gibi işletmeleri dışarıda bırakır.
KATEGORILER = [
    "historic_site",
    "home_developer",
    "real_estate_service",
    "real_estate_agent",
    "real_estate",
    "condominium",
    "housing_authority",
    "service_apartment",
    "apartment",
    "residential",
    "retirement_home",
    "lodging",
    "holiday_rental_home",
    "package_locker",
    "building_or_construction_service",
    "park",
    "swimming_pool",
    "beach",
]

AD = (
    "(sitesi|konutlar|konaklar|evleri|evler|villalar|villas|rezidans|residence|"
    "residans|toki|apartman|apt|blokları|bloklari|konut kooperatif)"
)


def surum():
    if len(sys.argv) > 1:
        return sys.argv[1]
    with urllib.request.urlopen("https://stac.overturemaps.org/catalog.json") as y:
        return json.load(y)["latest"]


def main():
    s = surum()
    print(f"Overture {s} — mekânlar…")
    db = duckdb.connect()
    db.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    db.execute("SET s3_region='us-west-2';")

    kategori = ",".join(f"'{k}'" for k in KATEGORILER)
    satirlar = db.execute(
        f"""
        SELECT id, names.primary AS ad, taxonomy.primary AS kategori,
               confidence, addresses[1].freeform AS adres,
               ST_X(geometry) AS x, ST_Y(geometry) AS y
        FROM read_parquet(
          's3://overturemaps-us-west-2/release/{s}/theme=places/type=place/*',
          hive_partitioning = 1)
        WHERE {KUTU}
          AND names.primary IS NOT NULL
          AND regexp_matches(lower(names.primary), '{AD}')
          AND (taxonomy.primary IS NULL OR taxonomy.primary IN ({kategori}))
          AND coalesce(confidence, 1) >= 0.4
          AND coalesce(operating_status, 'open') <> 'permanently_closed'
        """
    ).fetchall()

    kayitlar = [
        {
            "id": r[0],
            "ad": r[1],
            "kategori": r[2],
            "guven": round(r[3] or 0, 2),
            "adres": r[4],
            "x": r[5],
            "y": r[6],
        }
        for r in satirlar
    ]

    klasor = os.path.join(tempfile.gettempdir(), "sultan-osm")
    os.makedirs(klasor, exist_ok=True)
    yol = os.path.join(klasor, "overture.json")
    with open(yol, "w", encoding="utf8") as f:
        json.dump({"surum": s, "kayitlar": kayitlar}, f, ensure_ascii=False)
    print(f"{len(kayitlar)} aday → {yol}")


if __name__ == "__main__":
    main()
