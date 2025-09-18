import requests
import json

def test_api():
    base_url = "http://localhost:5000"
    
    print("测试节点API...")
    try:
        response = requests.get(f"{base_url}/api/node")
        print(f"状态码: {response.status_code}")
        print(f"响应内容: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    except Exception as e:
        print(f"节点API测试失败: {e}")
    
    print("\n测试虚拟机API...")
    try:
        response = requests.get(f"{base_url}/api/vms")
        print(f"状态码: {response.status_code}")
        print(f"响应内容: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    except Exception as e:
        print(f"虚拟机API测试失败: {e}")

if __name__ == "__main__":
    test_api()