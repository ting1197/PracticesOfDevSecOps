# NTUST 114-2 MI5315701 系統開發與作業安全實務

> 使用 Node.js 撰寫的電子商務微服務範例。

---

## 系統架構

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   Kubernetes Cluster                 │
                    │                  namespace: ecommerce                │
                    │                                                     │
   使用者            │  ┌──────────┐    ┌───────────────┐                  │
   (瀏覽器)  ──HTTPS──▶│ Ingress  │───▶│   Frontend    │                  │
                    │  │ (TLS終端) │    │  (Node/EJS)   │                  │
                    │  └──────────┘    │  Port: 3000    │                  │
                    │                  └───────┬────────┘                  │
                    │                          │                           │
                    │              ┌───────────┴───────────┐               │
                    │              ▼                       ▼               │
                    │  ┌───────────────────┐  ┌────────────────────────┐   │
                    │  │  Order Service    │  │  Inventory Service     │   │
                    │  │  (Node/Express)   │  │  (Node/Express)        │   │
                    │  │  Port: 3001       │──▶  Port: 3002            │   │
                    │  └────────┬──────────┘  └────────────┬───────────┘   │
                    │           │                          │               │
                    │           └──────────┬───────────────┘               │
                    │                      ▼                               │
                    │           ┌──────────────────┐                       │
                    │           │   PostgreSQL 16   │                      │
                    │           │   (PVC 持久化)    │                      │
                    │           │   Port: 5432      │                      │
                    │           └──────────────────┘                       │
                    │                                                     │
                    │  ┌──────────────┐  ┌──────────────┐                 │
                    │  │  Prometheus  │  │   Grafana    │                 │
                    │  │  (監控採集)   │  │  (視覺化面板) │                 │
                    │  └──────────────┘  └──────────────┘                 │
                    └─────────────────────────────────────────────────────┘
```

---

## 環境要求

| 工具 | 最低版本 | 安裝方式 |
|------|---------|---------|
| Docker | 20.10+ | [安裝指南](https://docs.docker.com/get-docker/) |
| Kubernetes (Minikube) | 1.28+ | `curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64` |
| kubectl | 1.28+ | [安裝指南](https://kubernetes.io/docs/tasks/tools/) |
| K6 | 0.45+ | [安裝指南](https://k6.io/docs/get-started/installation/) |
| Trivy | 0.45+ | [安裝指南](https://aquasecurity.github.io/trivy/) |
| OpenSSL | 1.1+ | 大多數系統已預裝 |

---

## 快速開始

### Step 1 — 複製專案並設定環境

```bash
git clone https://github.com/ting1197/PracticesOfDevSecOps
cd hw1

# 產生 .env 設定檔（包含隨機密碼）
./scripts/setup-env.sh
```

### Step 2 — 建置 Docker 映像

```bash
# 建置所有微服務映像
./scripts/build-images.sh ecommerce latest
```

> 如果使用 Minikube，請先執行 `eval $(minikube docker-env)` 讓 Docker 使用 Minikube 的 daemon。

### Step 3 — 部署到 Kubernetes

```bash
# 一鍵部署到 dev 環境
./scripts/deploy.sh dev
```

### Step 4 — 存取應用

```bash
# 取得 Frontend 服務 URL
minikube service frontend -n ecommerce --url

# 或使用 port-forward
kubectl port-forward svc/frontend 3000:3000 -n ecommerce
```

然後在瀏覽器開啟：`http://localhost:3000`

---

## 目錄結構

```
hw1/
├── frontend/                    # 前端服務
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   └── views/                      # EJS 模板
├── order-service/               # 訂單服務
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── inventory-service/           # 庫存服務
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── k8s/                         # Kubernetes 配置
│   ├── namespace.yaml
│   ├── base/                    # 基礎配置
│   ├── overlays/                # 環境覆蓋
│   │   ├── dev/
│   │   └── prod/
│   ├── rbac/                    # 角色權限
│   ├── network-policies/        # 網路策略
│   ├── ingress/                 # Ingress 配置
│   └── monitoring/              # 監控配置
│       ├── prometheus/
│       └── grafana/
├── tls/                         # TLS 憑證
│   └── generate-certs.sh
├── scripts/                     # 自動化腳本
│   ├── build-images.sh
│   ├── deploy.sh
│   ├── setup-env.sh
│   └── trivy-scan.sh
├── load-tests/                  # K6 負載測試
│   ├── k6-browse-products.js
│   ├── k6-place-order.js
│   └── k6-resilience.js
├── .env.example                    # 環境變數範本
├── .gitignore
└── README.md                       # 本文件
```

---

## API 端點

### Frontend（Port 3000）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/` | 首頁 — 商品列表 |
| `GET` | `/product/:id` | 商品詳情頁 |
| `POST` | `/cart/add` | 加入購物車 |
| `GET` | `/cart` | 檢視購物車 |
| `POST` | `/checkout` | 結帳下單 |
| `GET` | `/orders` | 訂單歷史 |
| `GET` | `/health` | 健康檢查 |
| `GET` | `/metrics` | Prometheus 指標 |

### Order Service（Port 3001）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/orders` | 建立新訂單 |
| `GET` | `/api/orders` | 查詢所有訂單 |
| `GET` | `/api/orders/:id` | 查詢單筆訂單 |
| `GET` | `/health` | 健康檢查 |
| `GET` | `/metrics` | Prometheus 指標 |

### Inventory Service（Port 3002）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/products` | 取得所有商品 |
| `GET` | `/api/products/:id` | 取得單一商品 |
| `POST` | `/api/products/:id/reserve` | 預留庫存 |
| `POST` | `/api/products/:id/release` | 釋放庫存 |
| `GET` | `/health` | 健康檢查 |
| `GET` | `/metrics` | Prometheus 指標 |

---

## 安全性

### Network Policies（網路策略）

控制 Pod 之間的網路流量，遵循最小權限原則：

- Frontend → Order Service（允許）
- Frontend → Inventory Service（允許）
- Order Service → Inventory Service（允許）
- Order / Inventory Service → PostgreSQL（允許）
- Frontend → PostgreSQL（禁止）
- 外部直接存取後端服務（禁止）

### RBAC（角色存取控制）

- 為每個服務建立獨立的 `ServiceAccount`
- 設定最小權限的 `Role` 和 `RoleBinding`
- 禁止不必要的 API 存取

### TLS 加密

```bash
# 產生自簽憑證並建立 K8s Secret
./tls/generate-certs.sh shop.local ecommerce
```

- 自動產生 CA 和伺服器憑證
- 支援 SAN（Subject Alternative Name）
- Ingress 層進行 TLS 終端

### Trivy 掃描

```bash
# 掃描所有映像的 HIGH/CRITICAL 漏洞
./scripts/trivy-scan.sh ecommerce latest

# 自定義嚴重等級
./scripts/trivy-scan.sh ecommerce latest "MEDIUM,HIGH,CRITICAL"
```

### Secrets 管理

- 敏感資訊使用 Kubernetes Secrets 儲存
- `setup-env.sh` 使用 `openssl rand` 產生隨機密碼

---

## 監控與可觀測性

### Prometheus 指標採集

所有微服務均暴露 `/metrics` 端點，提供以下指標：

- `http_request_duration_seconds` — HTTP 請求延遲
- `http_requests_total` — HTTP 請求總數
- `nodejs_heap_size_bytes` — Node.js 記憶體使用
- 自定義業務指標（訂單數、庫存變更等）

### Grafana 視覺化儀表板

```bash
# 存取 Grafana
kubectl port-forward svc/grafana 3001:3000 -n ecommerce

# 預設帳密
# 帳號: admin
# 密碼: 參見 .env 的 GF_ADMIN_PASSWORD
```

然後在瀏覽器開啟：`http://localhost:3001`

---

## 負載測試

使用 [K6](https://k6.io) 進行負載與壓力測試：

### 測試場景

| 腳本 | 場景 | 說明 |
|------|------|------|
| `k6-browse-products.js` | 模擬使用者瀏覽商品，從 0 漸增到 50 VU |
| `k6-place-order.js` | 模擬突發流量（Flash Sale），最高 50 req/s |
| `k6-resilience.js` | 持續負載 3 分鐘，期間可以嘗試手動刪除 Pod |

### 執行測試

```bash
# 商品瀏覽測試
k6 run load-tests/k6-browse-products.js

# 閃購搶單測試
k6 run load-tests/k6-place-order.js

# 韌性測試（在另一個終端手動 kill Pod）
k6 run load-tests/k6-resilience.js

# 指定目標 URL
k6 run -e BASE_URL=http://$(minikube ip):30000 load-tests/k6-browse-products.js
```

### 比較單副本 vs 多副本

```bash
# 1. 單副本測試
kubectl scale deployment/frontend --replicas=1 -n ecommerce
k6 run load-tests/k6-browse-products.js

# 2. 多副本測試
kubectl scale deployment/frontend --replicas=3 -n ecommerce
k6 run load-tests/k6-browse-products.js

# 3. 比較 p95 回應時間與錯誤率
```

### 韌性測試流程

```bash
# 終端 1：啟動 K6 持續負載
k6 run load-tests/k6-resilience.js

# 終端 2：在測試期間刪除 Pod
kubectl delete pod -l app=frontend -n ecommerce

# 終端 3：觀察 Pod 自動重啟
kubectl get pods -n ecommerce -l app=frontend -w
```

---

## 持久化驗證

驗證 PostgreSQL 資料在 Pod 重啟後仍然存在：

```bash
# Step 1: 新增一筆訂單
curl -X POST http://localhost:3000/checkout

# Step 2: 確認資料存在
kubectl exec -it deployment/postgres -n ecommerce -- \
  psql -U ecommerce -d ecommerce -c "SELECT * FROM orders;"

# Step 3: 刪除 PostgreSQL Pod
kubectl delete pod -l app=postgres -n ecommerce

# Step 4: 等待 Pod 重啟
kubectl get pods -l app=postgres -n ecommerce -w

# Step 5: 再次查詢 — 資料應仍存在
kubectl exec -it deployment/postgres -n ecommerce -- \
  psql -U ecommerce -d ecommerce -c "SELECT * FROM orders;"
```
