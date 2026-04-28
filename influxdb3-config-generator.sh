#!/bin/bash

#######################################################################
# InfluxDB 3 Enterprise - Configuration Generator
# 
# This script generates recommended startup options for influxdb3 serve
# based on the node mode, available CPUs, and RAM.
#
# Usage: ./influxdb3-config-generator.sh [--cpus N] [--ram N] [--mode MODE]
#
# Options:
#   --cpus N     Number of CPU cores (default: auto-detect)
#   --ram N      RAM in GB (default: auto-detect)
#   --mode MODE  Node mode: all, ingest, query, compact, process, 
#                ingest-query, query-compact (default: interactive)
#   --help       Show this help message
#
#######################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Default values
CPUS=""
RAM_GB=""
MODE=""
OBJECT_STORE="file"
SHOW_ENV_VARS=false

#######################################################################
# Helper Functions
#######################################################################

print_header() {
    echo -e "\n${BOLD}${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${BLUE}  InfluxDB 3 Enterprise - Configuration Generator${NC}"
    echo -e "${BOLD}${BLUE}════════════════════════════════════════════════════════════════${NC}\n"
}

print_section() {
    echo -e "\n${BOLD}${CYAN}── $1 ──${NC}\n"
}

print_info() {
    echo -e "${BLUE}ℹ${NC}  $1"
}

print_success() {
    echo -e "${GREEN}✓${NC}  $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_error() {
    echo -e "${RED}✗${NC}  $1"
}

detect_cpus() {
    if [[ -f /proc/cpuinfo ]]; then
        grep -c ^processor /proc/cpuinfo 2>/dev/null || nproc 2>/dev/null || echo "4"
    elif command -v sysctl &> /dev/null; then
        sysctl -n hw.ncpu 2>/dev/null || echo "4"
    else
        echo "4"
    fi
}

detect_ram_gb() {
    if [[ -f /proc/meminfo ]]; then
        local mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        echo $((mem_kb / 1024 / 1024))
    elif command -v sysctl &> /dev/null; then
        local mem_bytes=$(sysctl -n hw.memsize 2>/dev/null || echo "8589934592")
        echo $((mem_bytes / 1024 / 1024 / 1024))
    else
        echo "8"
    fi
}

show_help() {
    cat << EOF
${BOLD}InfluxDB 3 Enterprise Configuration Generator${NC}

Generates recommended startup options for influxdb3 serve based on 
node mode, available CPUs, and RAM.

${BOLD}USAGE:${NC}
    $0 [OPTIONS]

${BOLD}OPTIONS:${NC}
    --cpus N        Number of CPU cores (default: auto-detect)
    --ram N         RAM in GB (default: auto-detect)
    --mode MODE     Node mode (default: interactive selection)
    --object-store  Object store type: file, s3, gcs, azure (default: file)
    --env-vars      Also show environment variable configuration
    --help          Show this help message

${BOLD}AVAILABLE MODES:${NC}
    all             All capabilities (ingest + query + compact + process)
    ingest          Data ingestion only
    query           Query execution only
    compact         Compaction only
    process         Data processing only
    ingest-query    Combined ingest and query
    query-compact   Combined query and compaction

${BOLD}EXAMPLES:${NC}
    # Auto-detect resources, interactive mode selection
    $0

    # Specify resources and mode
    $0 --cpus 32 --ram 64 --mode ingest

    # Generate config for query node with 48 cores
    $0 --cpus 48 --ram 128 --mode query

    # Show environment variables too
    $0 --cpus 16 --ram 32 --mode all --env-vars

EOF
    exit 0
}

#######################################################################
# Parse Arguments
#######################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --cpus)
            CPUS="$2"
            shift 2
            ;;
        --ram)
            RAM_GB="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --object-store)
            OBJECT_STORE="$2"
            shift 2
            ;;
        --env-vars)
            SHOW_ENV_VARS=true
            shift
            ;;
        --help|-h)
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

#######################################################################
# Detect or Validate Resources
#######################################################################

print_header

# Detect CPUs if not specified
if [[ -z "$CPUS" ]]; then
    CPUS=$(detect_cpus)
    print_info "Auto-detected CPUs: ${BOLD}$CPUS${NC}"
else
    print_info "Using specified CPUs: ${BOLD}$CPUS${NC}"
fi

# Detect RAM if not specified
if [[ -z "$RAM_GB" ]]; then
    RAM_GB=$(detect_ram_gb)
    print_info "Auto-detected RAM: ${BOLD}${RAM_GB}GB${NC}"
else
    print_info "Using specified RAM: ${BOLD}${RAM_GB}GB${NC}"
fi

# Validate inputs
if [[ $CPUS -lt 2 ]]; then
    print_warning "Minimum 2 CPUs required. Setting to 2."
    CPUS=2
fi

if [[ $RAM_GB -lt 2 ]]; then
    print_warning "Minimum 2GB RAM recommended. Setting to 2."
    RAM_GB=2
fi

#######################################################################
# Mode Selection
#######################################################################

select_mode() {
    print_section "Select Node Mode"
    
    echo "Available modes:"
    echo ""
    echo "  ${BOLD}1)${NC} all           - All capabilities (default, balanced workload)"
    echo "  ${BOLD}2)${NC} ingest        - High-throughput data ingestion"
    echo "  ${BOLD}3)${NC} query         - Analytical query execution"
    echo "  ${BOLD}4)${NC} compact       - Background compaction"
    echo "  ${BOLD}5)${NC} process       - Data processing with plugins"
    echo "  ${BOLD}6)${NC} ingest,query  - Combined ingest and query"
    echo "  ${BOLD}7)${NC} query,compact - Combined query and compaction"
    echo ""
    
    read -p "Select mode [1-7] (default: 1): " choice
    
    case $choice in
        1|"") MODE="all" ;;
        2) MODE="ingest" ;;
        3) MODE="query" ;;
        4) MODE="compact" ;;
        5) MODE="process" ;;
        6) MODE="ingest-query" ;;
        7) MODE="query-compact" ;;
        *)
            print_warning "Invalid selection. Using 'all' mode."
            MODE="all"
            ;;
    esac
}

# Normalize mode input
normalize_mode() {
    case $MODE in
        ingest-query|ingest_query) MODE="ingest,query" ;;
        query-compact|query_compact) MODE="query,compact" ;;
        ingest-query-compact|ingest_query_compact) MODE="ingest,query,compact" ;;
    esac
}

if [[ -z "$MODE" ]]; then
    select_mode
fi
normalize_mode

print_success "Selected mode: ${BOLD}$MODE${NC}"

#######################################################################
# Calculate Thread Allocation
#######################################################################

calculate_threads() {
    local mode=$1
    local cpus=$2
    local ram_gb=$3
    
    # Initialize variables
    local io_threads=2
    local datafusion_threads=$((cpus - 2))
    local mem_pool_percent=70
    local parquet_cache_gb=0
    local description=""
    
    case $mode in
        ingest)
            # Ingest: More IO threads for line protocol parsing
            # Rule: ~1 IO thread per concurrent writer, up to 40% of cores
            io_threads=$((cpus * 35 / 100))
            if [[ $io_threads -lt 4 ]]; then io_threads=4; fi
            if [[ $io_threads -gt 20 ]]; then io_threads=20; fi
            
            datafusion_threads=$((cpus - io_threads))
            if [[ $datafusion_threads -lt 2 ]]; then datafusion_threads=2; fi
            
            mem_pool_percent=60
            parquet_cache_gb=0  # Ingest doesn't need query cache
            description="Optimized for high-throughput data ingestion"
            ;;
            
        query)
            # Query: Maximize DataFusion threads, minimal IO
            io_threads=4
            if [[ $cpus -lt 8 ]]; then io_threads=2; fi
            
            datafusion_threads=$((cpus - io_threads))
            
            mem_pool_percent=90
            # Cache: ~10-15% of RAM, max 16GB
            parquet_cache_gb=$((ram_gb * 15 / 100))
            if [[ $parquet_cache_gb -gt 16 ]]; then parquet_cache_gb=16; fi
            if [[ $parquet_cache_gb -lt 1 ]]; then parquet_cache_gb=1; fi
            
            description="Optimized for analytical query execution"
            ;;
            
        compact)
            # Compact: Primarily DataFusion for sort/dedupe
            io_threads=2
            
            datafusion_threads=$((cpus - io_threads))
            
            mem_pool_percent=80
            parquet_cache_gb=0  # Compaction doesn't need query cache
            description="Optimized for background compaction"
            ;;
            
        process)
            # Process: Balanced for plugin execution
            io_threads=$((cpus * 25 / 100))
            if [[ $io_threads -lt 2 ]]; then io_threads=2; fi
            if [[ $io_threads -gt 8 ]]; then io_threads=8; fi
            
            datafusion_threads=$((cpus - io_threads))
            
            mem_pool_percent=70
            parquet_cache_gb=$((ram_gb * 10 / 100))
            if [[ $parquet_cache_gb -gt 8 ]]; then parquet_cache_gb=8; fi
            
            description="Optimized for data processing with plugins"
            ;;
            
        "ingest,query")
            # Combined: Balance between ingest and query
            io_threads=$((cpus * 25 / 100))
            if [[ $io_threads -lt 4 ]]; then io_threads=4; fi
            if [[ $io_threads -gt 16 ]]; then io_threads=16; fi
            
            datafusion_threads=$((cpus - io_threads))
            
            mem_pool_percent=75
            parquet_cache_gb=$((ram_gb * 10 / 100))
            if [[ $parquet_cache_gb -gt 8 ]]; then parquet_cache_gb=8; fi
            
            description="Balanced for combined ingest and query workloads"
            ;;
            
        "query,compact")
            # Query + Compact: Focus on DataFusion
            io_threads=4
            if [[ $cpus -lt 8 ]]; then io_threads=2; fi
            
            datafusion_threads=$((cpus - io_threads))
            
            mem_pool_percent=85
            parquet_cache_gb=$((ram_gb * 12 / 100))
            if [[ $parquet_cache_gb -gt 12 ]]; then parquet_cache_gb=12; fi
            
            description="Optimized for query and compaction workloads"
            ;;
            
        all|*)
            # All: Balanced allocation
            io_threads=$((cpus * 20 / 100))
            if [[ $io_threads -lt 2 ]]; then io_threads=2; fi
            if [[ $io_threads -gt 12 ]]; then io_threads=12; fi
            
            datafusion_threads=$((cpus - io_threads))
            
            mem_pool_percent=70
            parquet_cache_gb=$((ram_gb * 10 / 100))
            if [[ $parquet_cache_gb -gt 8 ]]; then parquet_cache_gb=8; fi
            
            description="Balanced for all workloads (ingest, query, compact, process)"
            ;;
    esac
    
    # Ensure minimums
    if [[ $io_threads -lt 1 ]]; then io_threads=1; fi
    if [[ $datafusion_threads -lt 1 ]]; then datafusion_threads=1; fi
    
    # Export results
    CALC_IO_THREADS=$io_threads
    CALC_DATAFUSION_THREADS=$datafusion_threads
    CALC_MEM_POOL_PERCENT=$mem_pool_percent
    CALC_PARQUET_CACHE_GB=$parquet_cache_gb
    CALC_DESCRIPTION=$description
}

#######################################################################
# Calculate Additional Settings
#######################################################################

calculate_additional_settings() {
    local ram_gb=$1
    
    # WAL settings based on RAM
    if [[ $ram_gb -ge 64 ]]; then
        WAL_REPLAY_CONCURRENCY=20
        SNAPSHOT_MEM_THRESHOLD="70%"
    elif [[ $ram_gb -ge 32 ]]; then
        WAL_REPLAY_CONCURRENCY=16
        SNAPSHOT_MEM_THRESHOLD="60%"
    elif [[ $ram_gb -ge 16 ]]; then
        WAL_REPLAY_CONCURRENCY=12
        SNAPSHOT_MEM_THRESHOLD="50%"
    else
        WAL_REPLAY_CONCURRENCY=8
        SNAPSHOT_MEM_THRESHOLD="40%"
    fi
    
    # Object store connections based on mode
    case $MODE in
        ingest|"ingest,query")
            OBJECT_STORE_CONNECTIONS=32
            ;;
        query)
            OBJECT_STORE_CONNECTIONS=48
            ;;
        compact)
            OBJECT_STORE_CONNECTIONS=24
            ;;
        *)
            OBJECT_STORE_CONNECTIONS=32
            ;;
    esac
}

#######################################################################
# Generate Configuration
#######################################################################

calculate_threads "$MODE" "$CPUS" "$RAM_GB"
calculate_additional_settings "$RAM_GB"

print_section "Resource Allocation Summary"

echo -e "${BOLD}System Resources:${NC}"
echo "  CPU Cores:        $CPUS"
echo "  RAM:              ${RAM_GB}GB"
echo ""
echo -e "${BOLD}Thread Allocation:${NC}"
echo "  IO Threads:       $CALC_IO_THREADS (HTTP requests, line protocol parsing)"
echo "  DataFusion:       $CALC_DATAFUSION_THREADS (queries, snapshots, compaction)"
echo ""
echo -e "${BOLD}Memory Allocation:${NC}"
echo "  Exec Memory Pool: ${CALC_MEM_POOL_PERCENT}%"
if [[ $CALC_PARQUET_CACHE_GB -gt 0 ]]; then
    echo "  Parquet Cache:    ${CALC_PARQUET_CACHE_GB}GB"
fi
echo ""
echo -e "${BOLD}Mode:${NC} $MODE"
echo -e "${BOLD}Description:${NC} $CALC_DESCRIPTION"

#######################################################################
# Generate Command
#######################################################################

print_section "Recommended Command"

# Build the command
CMD="influxdb3 --num-io-threads=$CALC_IO_THREADS serve \\"
CMD+="\n  --mode=$MODE \\"
CMD+="\n  --node-id=<YOUR_NODE_ID> \\"
CMD+="\n  --cluster-id=<YOUR_CLUSTER_ID> \\"

case $OBJECT_STORE in
    s3)
        CMD+="\n  --object-store=s3 \\"
        CMD+="\n  --bucket=<YOUR_BUCKET> \\"
        CMD+="\n  --aws-default-region=<YOUR_REGION> \\"
        ;;
    gcs|google)
        CMD+="\n  --object-store=google \\"
        CMD+="\n  --bucket=<YOUR_BUCKET> \\"
        CMD+="\n  --google-service-account=<PATH_TO_CREDENTIALS> \\"
        ;;
    azure)
        CMD+="\n  --object-store=azure \\"
        CMD+="\n  --bucket=<YOUR_CONTAINER> \\"
        CMD+="\n  --azure-storage-account=<YOUR_ACCOUNT> \\"
        ;;
    *)
        CMD+="\n  --object-store=file \\"
        CMD+="\n  --data-dir=/var/lib/influxdb3 \\"
        ;;
esac

CMD+="\n  --datafusion-num-threads=$CALC_DATAFUSION_THREADS \\"
CMD+="\n  --exec-mem-pool-bytes=${CALC_MEM_POOL_PERCENT}% \\"

if [[ $CALC_PARQUET_CACHE_GB -gt 0 ]]; then
    CMD+="\n  --parquet-mem-cache-size=${CALC_PARQUET_CACHE_GB}GB \\"
fi

CMD+="\n  --checkpoint-interval=1h \\"
CMD+="\n  --wal-replay-concurrency-limit=$WAL_REPLAY_CONCURRENCY \\"
CMD+="\n  --force-snapshot-mem-threshold=$SNAPSHOT_MEM_THRESHOLD \\"
CMD+="\n  --object-store-connection-limit=$OBJECT_STORE_CONNECTIONS \\"

# Add mode-specific options
case $MODE in
    compact|"query,compact")
        CMD+="\n  --compaction-gen2-duration=24h \\"
        CMD+="\n  --compaction-check-interval=5m \\"
        ;;
    process)
        CMD+="\n  --plugin-dir=/var/lib/influxdb3/plugins \\"
        ;;
esac

CMD+="\n  --license-email=<YOUR_EMAIL>"

echo -e "${GREEN}$CMD${NC}"

#######################################################################
# Generate Environment Variables (Optional)
#######################################################################

if [[ "$SHOW_ENV_VARS" == "true" ]]; then
    print_section "Environment Variable Configuration"
    
    echo -e "${YELLOW}# Thread configuration${NC}"
    echo "export INFLUXDB3_NUM_IO_THREADS=$CALC_IO_THREADS"
    echo "export INFLUXDB3_DATAFUSION_NUM_THREADS=$CALC_DATAFUSION_THREADS"
    echo ""
    echo -e "${YELLOW}# Mode and identity${NC}"
    echo "export INFLUXDB3_ENTERPRISE_MODE=$MODE"
    echo "export INFLUXDB3_NODE_IDENTIFIER_PREFIX=<YOUR_NODE_ID>"
    echo "export INFLUXDB3_ENTERPRISE_CLUSTER_ID=<YOUR_CLUSTER_ID>"
    echo ""
    echo -e "${YELLOW}# Memory configuration${NC}"
    echo "export INFLUXDB3_EXEC_MEM_POOL_BYTES=${CALC_MEM_POOL_PERCENT}%"
    if [[ $CALC_PARQUET_CACHE_GB -gt 0 ]]; then
        echo "export INFLUXDB3_PARQUET_MEM_CACHE_SIZE=${CALC_PARQUET_CACHE_GB}GB"
    fi
    echo "export INFLUXDB3_FORCE_SNAPSHOT_MEM_THRESHOLD=$SNAPSHOT_MEM_THRESHOLD"
    echo ""
    echo -e "${YELLOW}# Startup optimization${NC}"
    echo "export INFLUXDB3_CHECKPOINT_INTERVAL=1h"
    echo "export INFLUXDB3_WAL_REPLAY_CONCURRENCY_LIMIT=$WAL_REPLAY_CONCURRENCY"
    echo ""
    echo -e "${YELLOW}# Object store${NC}"
    
    case $OBJECT_STORE in
        s3)
            echo "export INFLUXDB3_OBJECT_STORE=s3"
            echo "export INFLUXDB3_BUCKET=<YOUR_BUCKET>"
            echo "export AWS_DEFAULT_REGION=<YOUR_REGION>"
            echo "export AWS_ACCESS_KEY_ID=<YOUR_ACCESS_KEY>"
            echo "export AWS_SECRET_ACCESS_KEY=<YOUR_SECRET_KEY>"
            ;;
        gcs|google)
            echo "export INFLUXDB3_OBJECT_STORE=google"
            echo "export INFLUXDB3_BUCKET=<YOUR_BUCKET>"
            echo "export GOOGLE_SERVICE_ACCOUNT=<PATH_TO_CREDENTIALS>"
            ;;
        azure)
            echo "export INFLUXDB3_OBJECT_STORE=azure"
            echo "export INFLUXDB3_BUCKET=<YOUR_CONTAINER>"
            echo "export AZURE_STORAGE_ACCOUNT=<YOUR_ACCOUNT>"
            echo "export AZURE_STORAGE_ACCESS_KEY=<YOUR_KEY>"
            ;;
        *)
            echo "export INFLUXDB3_OBJECT_STORE=file"
            echo "export INFLUXDB3_DB_DIR=/var/lib/influxdb3"
            ;;
    esac
    
    echo "export INFLUXDB3_OBJECT_STORE_CONNECTION_LIMIT=$OBJECT_STORE_CONNECTIONS"
    echo ""
    echo -e "${YELLOW}# Licensing${NC}"
    echo "export INFLUXDB3_ENTERPRISE_LICENSE_EMAIL=<YOUR_EMAIL>"
    
    if [[ "$MODE" == *"compact"* ]]; then
        echo ""
        echo -e "${YELLOW}# Compaction settings${NC}"
        echo "export INFLUXDB3_ENTERPRISE_COMPACTION_GEN2_DURATION=24h"
        echo "export INFLUXDB3_ENTERPRISE_COMPACTION_CHECK_INTERVAL=5m"
    fi
    
    if [[ "$MODE" == "process" ]]; then
        echo ""
        echo -e "${YELLOW}# Processing engine${NC}"
        echo "export INFLUXDB3_PLUGIN_DIR=/var/lib/influxdb3/plugins"
    fi
fi

#######################################################################
# Recommendations
#######################################################################

print_section "Additional Recommendations"

case $MODE in
    ingest)
        echo "• Scale IO threads with concurrent writers (~1 thread per writer)"
        echo "• Monitor WAL size and adjust --wal-flush-interval if needed"
        echo "• Consider --wal-max-write-buffer-size for high-throughput scenarios"
        ;;
    query)
        echo "• Increase --parquet-mem-cache-size for frequently accessed data"
        echo "• Use --datafusion-config for advanced query tuning"
        echo "• Monitor query latency and adjust memory pool as needed"
        ;;
    compact)
        echo "• Adjust --compaction-multipliers for your data patterns"
        echo "• Monitor compaction lag and add nodes if falling behind"
        echo "• Consider --compaction-max-num-files-per-plan for large datasets"
        ;;
    process)
        echo "• Ensure --plugin-dir contains your Python plugins"
        echo "• Configure --virtual-env-location for dependencies"
        echo "• Monitor plugin execution times and resource usage"
        ;;
    *)
        echo "• Monitor all workloads and consider specializing nodes if needed"
        echo "• Enable checkpointing for faster restarts"
        echo "• Adjust thread allocation based on observed workload patterns"
        ;;
esac

echo ""
echo "• Always test configuration changes in a non-production environment"
echo "• Monitor metrics endpoint at /metrics for performance insights"
echo "• Use --log-filter for debugging specific components"

#######################################################################
# Summary Table
#######################################################################

print_section "Quick Reference - All Modes for $CPUS CPUs / ${RAM_GB}GB RAM"

printf "\n${BOLD}%-15s %10s %12s %10s %12s${NC}\n" "Mode" "IO Threads" "DF Threads" "Mem Pool" "Cache"
printf "%-15s %10s %12s %10s %12s\n" "---------------" "----------" "------------" "----------" "------------"

for m in "all" "ingest" "query" "compact" "process" "ingest,query" "query,compact"; do
    calculate_threads "$m" "$CPUS" "$RAM_GB"
    cache_str="${CALC_PARQUET_CACHE_GB}GB"
    if [[ $CALC_PARQUET_CACHE_GB -eq 0 ]]; then
        cache_str="-"
    fi
    printf "%-15s %10d %12d %10s %12s\n" "$m" "$CALC_IO_THREADS" "$CALC_DATAFUSION_THREADS" "${CALC_MEM_POOL_PERCENT}%" "$cache_str"
done

echo ""
print_success "Configuration generated successfully!"
echo ""
