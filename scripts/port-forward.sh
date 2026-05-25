#!/bin/bash
# ==============================================================================
# ShopK8s Service Port-Forwarding Manager
# ==============================================================================
# This script manages local port-forwarding to K8s services in the 'ecommerce' namespace.
# Services and local ports:
#   - Frontend:    http://localhost:3000 -> Pod:3000
#   - Grafana:     http://localhost:3001 -> Pod:3000
#   - Prometheus:  http://localhost:9090 -> Pod:9090
#   - Order Svc:   http://localhost:3004 -> Pod:3001
#   - Inventory:   http://localhost:3005 -> Pod:3002
# ==============================================================================

set -euo pipefail

NAMESPACE="ecommerce"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.port-forward.pid"
LOG_DIR="${SCRIPT_DIR}/../logs/port-forward"

# Check if kubectl is connected
check_k8s() {
    if ! kubectl cluster-info &>/dev/null; then
        echo "Error: Cannot connect to Kubernetes cluster. Please make sure your cluster is running."
        exit 1
    fi
}

start_pfs() {
    check_k8s

    if [ -f "$PID_FILE" ]; then
        # Check if any PIDs from the file are actually running
        any_running=false
        while IFS= read -r line || [ -n "$line" ]; do
            if [ -z "$line" ]; then continue; fi
            pid=$(echo "$line" | cut -d: -f1)
            if kill -0 "$pid" 2>/dev/null; then
                any_running=true
                break
            fi
        done < "$PID_FILE"

        if [ "$any_running" = true ]; then
            echo "Port-forwarding is already running or PID file exists."
            show_status
            exit 0
        else
            echo "⚠️  Found stale PID file (processes are not running). Cleaning it up and starting fresh..."
            rm -f "$PID_FILE"
        fi
    fi

    echo "========================================"
    echo "Starting port-forwarding for ShopK8s..."
    echo "========================================"
    
    mkdir -p "$LOG_DIR"
    touch "$PID_FILE"

    # Define services: "local_port:pod_port" "service_name" "log_name"
    SERVICES=(
        "3000:3000 frontend frontend"
        "3001:3000 grafana grafana"
        "9090:9090 prometheus prometheus"
        "3004:3001 order-service order-service"
        "3005:3002 inventory-service inventory-service"
    )

    for svc_info in "${SERVICES[@]}"; do
        read -r ports svc log_name <<< "$svc_info"
        
        local_port=$(echo "$ports" | cut -d: -f1)
        pod_port=$(echo "$ports" | cut -d: -f2)

        # Check if local port is already in use
        if lsof -i :"$local_port" &>/dev/null; then
            echo "❌ Error: Port $local_port is already in use! Skipping $svc."
            echo "   Process using this port:"
            lsof -i :"$local_port" -P -n | awk 'NR>1 {printf "     -> Command: %s (PID: %s, User: %s)\n", $1, $2, $3}'
            continue
        fi

        echo "---> Forwarding $svc ($ports)..."
        # Run port forward in background
        nohup kubectl port-forward "svc/$svc" "$ports" -n "$NAMESPACE" > "${LOG_DIR}/${log_name}.log" 2>&1 &
        pid=$!
        
        # Save to PID file
        echo "$pid:$svc:$local_port" >> "$PID_FILE"
    done

    sleep 1.5
    echo ""
    echo "✅ Port-forwarding started!"
    echo "Access URLs:"
    echo "  - 🛒 Shopping Frontend:  http://localhost:3000"
    echo "  - 📊 Grafana Dashboard:   http://localhost:3001 (User: admin, Pwd: admin_secret_2024)"
    echo "  - 🔍 Prometheus:          http://localhost:9090"
    echo "  - 📦 Order API proxy:    http://localhost:3004"
    echo "  - ⚙️  Inventory API:       http://localhost:3005"
    echo ""
    echo "Logs are available in: $LOG_DIR"
    echo "========================================"
}

stop_pfs() {
    if [ ! -f "$PID_FILE" ]; then
        echo "No port-forwarding processes found (PID file does not exist)."
        exit 0
    fi

    echo "========================================"
    echo "Stopping port-forwarding processes..."
    echo "========================================"

    while IFS= read -r line || [ -n "$line" ]; do
        if [ -z "$line" ]; then continue; fi
        
        pid=$(echo "$line" | cut -d: -f1)
        svc=$(echo "$line" | cut -d: -f2)
        port=$(echo "$line" | cut -d: -f3)

        if kill -0 "$pid" 2>/dev/null; then
            echo "---> Stopping port-forward for $svc (Port $port, PID $pid)..."
            kill "$pid"
        else
            echo "---> Port-forward for $svc (PID $pid) already stopped."
        fi
    done < "$PID_FILE"

    rm -f "$PID_FILE"
    echo "✅ All port-forwarding processes stopped."
    echo "========================================"
}

show_status() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Port-forwarding is NOT running."
        exit 0
    fi

    echo "====================================================="
    echo "Active Port-Forwarding Status:"
    echo "====================================================="
    printf "%-10s %-20s %-10s %-10s\n" "PID" "Service" "Local Port" "Status"
    printf "%-10s %-20s %-10s %-10s\n" "---" "-------" "----------" "------"

    while IFS= read -r line || [ -n "$line" ]; do
        if [ -z "$line" ]; then continue; fi
        
        pid=$(echo "$line" | cut -d: -f1)
        svc=$(echo "$line" | cut -d: -f2)
        port=$(echo "$line" | cut -d: -f3)

        if kill -0 "$pid" 2>/dev/null; then
            status="Running"
        else
            status="Stopped"
        fi
        
        printf "%-10s %-20s %-10s %-10s\n" "$pid" "$svc" "$port" "$status"
    done < "$PID_FILE"
    echo "====================================================="
}

case "${1:-status}" in
    start)
        start_pfs
        ;;
    stop)
        stop_pfs
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
