import requests
import json

subdomain = "snc-nw"
app_id = 160
api_token = "ucVr8MdWuYo4aR1SrTIkRmq948tZq0LkVxplKHKP"

url = f"https://{subdomain}.cybozu.com/k/v1/preview/app/status.json"

headers = {
    "X-Cybozu-API-Token": api_token
}

params = {
    "app": app_id
}

res = requests.get(url, headers=headers, params=params)
data = res.json()

# 見やすく表示
print(json.dumps(data, indent=2, ensure_ascii=False))