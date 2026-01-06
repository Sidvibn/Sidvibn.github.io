import requests
import json
import os

ADS_TOKEN = os.environ["ADS_API_TOKEN"]

headers = {
    "Authorization": f"Bearer {ADS_TOKEN}"
}

params = {
    "q": 'author:"Suar, S"',
    "fl": "title,author,year,pub,doi,bibcode,arxiv_class",
    "rows": 100,
    "sort": "date desc"
}

r = requests.get(
    "https://api.adsabs.harvard.edu/v1/search/query",
    headers=headers,
    params=params
)

docs = r.json()["response"]["docs"]

with open("publications.json", "w") as f:
    json.dump(docs, f, indent=2)
