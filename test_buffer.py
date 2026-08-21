import urllib.request
import urllib.parse
import json

# Test recherche parcelle avec un buffer ou bbox si le point exact tombe sur la voirie
lon, lat = 2.647102, 48.85856 # 1 Rue de Paris Torcy
delta = 0.0001
bbox_geom = {
    "type": "Polygon",
    "coordinates": [[
        [lon - delta, lat - delta],
        [lon + delta, lat - delta],
        [lon + delta, lat + delta],
        [lon - delta, lat + delta],
        [lon - delta, lat - delta]
    ]]
}
apicarto_url = f"https://apicarto.ign.fr/api/cadastre/parcelle?geom={urllib.parse.quote(json.dumps(bbox_geom))}"
req = urllib.request.Request(apicarto_url, headers={"Accept": "application/json"})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print(f"Features trouvées avec buffer BBox: {len(data.get('features', []))}")
    if data.get('features'):
        feat = data['features'][0]['properties']
        print(f"Section: {feat.get('section')}, Numero: {feat.get('numero')}, Contenance: {feat.get('contenance')}")
