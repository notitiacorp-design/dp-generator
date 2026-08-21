import urllib.request
import urllib.parse
import json
import os

print("=== DEBUT DU TEST DE VALIDATION END-TO-END ===")

# 1. Test Pipeline Cadastre & BAN
addresses = [
    {"name": "Cas 1 (Maison Individuelle Standard - Torcy)", "query": "1 Rue de Paris 77200 Torcy"},
    {"name": "Cas 2 (Maison Pavillonnaire - Montpellier/Béziers)", "query": "12 Avenue Jean Moulin 34500 Beziers"}
]

for cas in addresses:
    print(f"\n--- Test Cadastre: {cas['name']} ---")
    url = f"https://api-adresse.data.gouv.fr/search/?q={urllib.parse.quote(cas['query'])}&limit=1"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        feature = data['features'][0]
        coords = feature['geometry']['coordinates']
        label = feature['properties']['label']
        postcode = feature['properties']['postcode']
        city = feature['properties']['city']
        print(f"✓ BAN Adresse trouvée : {label} ({coords[0]}, {coords[1]})")

    # Cadastre IGN Apicarto
    geom = json.dumps({"type": "Point", "coordinates": coords})
    apicarto_url = f"https://apicarto.ign.fr/api/cadastre/parcelle?geom={urllib.parse.quote(geom)}"
    req_cad = urllib.request.Request(apicarto_url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req_cad) as resp_cad:
            cad_data = json.loads(resp_cad.read().decode('utf-8'))
            cad_feat = cad_data['features'][0]['properties']
            print(f"✓ Cadastre Apicarto : Section {cad_feat.get('section')}, N° {cad_feat.get('numero')}, Commune {cad_feat.get('nom_com')}, Contenance {cad_feat.get('contenance')} m²")
    except Exception as e:
        print(f"! Erreur apicarto: {e}")
