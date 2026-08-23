#!/usr/bin/env bash
set -euo pipefail

# Generate Proxmox NoCloud snippets for Kamino VyOS pod routers.
#
# WAN_SUBNET is the /16 the pods' WAN addresses are carved out of, in CIDR
# notation. Each pod's network number fills the third octet:
#
#   WAN_SUBNET=172.16.0.0/16, network 24 -> WAN 172.16.24.1/16, NAT /24 172.16.24.0/24
#
# WAN_NEXT_HOP defaults to .1 of WAN_SUBNET (172.16.0.0/16 -> 172.16.0.1),
# which is where the upstream router normally lives. Override it only if the
# upstream gateway is somewhere else in the subnet.
#
# Profiles:
#   lan-router-v1
#     eth0: WAN, <wan>.<N>.1/16
#     eth1: LAN, 192.168.1.1/24
#     <wan>.<N>.0/24 <-> 192.168.1.0/24 prefix NAT
#
#   lan-dmz-router-v1
#     eth0: WAN, <wan>.<N>.1/16
#     eth1: LAN, 192.168.1.1/24
#     eth2: DMZ, 10.0.50.1/24
#     <wan>.<N>.0/24 <-> 10.0.50.0/24 prefix NAT
#     LAN outbound traffic is masqueraded.
#
# Both profiles use static addressing, provide Internet access through
# WAN_NEXT_HOP, enable proxy ARP for the translated WAN /24, and configure
# no VyOS firewall rules.
#
# This script creates snippet files only. It does not create Proxmox VNets
# or change Proxmox firewall settings.

SNIPPET_DIR="${SNIPPET_DIR:-/mnt/pve/mufasa-proxmox/snippets}"
NETWORK_PROFILE="${NETWORK_PROFILE:-all}"
NETWORK_MIN="${NETWORK_MIN:-1}"
NETWORK_MAX="${NETWORK_MAX:-254}"

WAN_SUBNET="${WAN_SUBNET:-172.16.0.0/16}"
DNS_PRIMARY="${DNS_PRIMARY:-1.1.1.1}"
DNS_SECONDARY="${DNS_SECONDARY:-8.8.8.8}"

LAN_ROUTER_SUBNET="${LAN_ROUTER_SUBNET:-192.168.1.0/24}"
LAN_ROUTER_GATEWAY_HOST="${LAN_ROUTER_GATEWAY_HOST:-1}"

LAN_DMZ_ROUTER_LAN_SUBNET="${LAN_DMZ_ROUTER_LAN_SUBNET:-192.168.1.0/24}"
LAN_DMZ_ROUTER_LAN_GATEWAY_HOST="${LAN_DMZ_ROUTER_LAN_GATEWAY_HOST:-1}"
LAN_DMZ_ROUTER_DMZ_SUBNET="${LAN_DMZ_ROUTER_DMZ_SUBNET:-10.0.50.0/24}"
LAN_DMZ_ROUTER_DMZ_GATEWAY_HOST="${LAN_DMZ_ROUTER_DMZ_GATEWAY_HOST:-1}"

default_lan_router_user_file_pattern='kamino-router-{network}-user-data.yaml'
LAN_ROUTER_USER_FILE_PATTERN="${LAN_ROUTER_USER_FILE_PATTERN:-$default_lan_router_user_file_pattern}"
LAN_ROUTER_NETWORK_CONFIG_FILE="${LAN_ROUTER_NETWORK_CONFIG_FILE:-kamino-router-network-config.yaml}"

default_lan_dmz_router_user_file_pattern='kamino-router-lan-dmz-{network}-user-data.yaml'
LAN_DMZ_ROUTER_USER_FILE_PATTERN="${LAN_DMZ_ROUTER_USER_FILE_PATTERN:-$default_lan_dmz_router_user_file_pattern}"
LAN_DMZ_ROUTER_NETWORK_CONFIG_FILE="${LAN_DMZ_ROUTER_NETWORK_CONFIG_FILE:-kamino-router-lan-dmz-network-config.yaml}"

fail() {
  echo "error: $*" >&2
  exit 1
}

validate_octet() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac

  [ "$1" -le 255 ]
}

validate_host_octet() {
  validate_octet "$1" &&
    [ "$1" -ge 1 ] &&
    [ "$1" -le 254 ]
}

validate_ipv4() {
  local value="$1"
  local a b c d extra

  IFS=. read -r a b c d extra <<<"$value"

  [ -z "${extra:-}" ] &&
    validate_octet "$a" &&
    validate_octet "$b" &&
    validate_octet "$c" &&
    validate_octet "$d"
}

parse_subnet24() {
  local label="$1"
  local value="$2"
  local address prefix_length
  local a b c d extra

  IFS=/ read -r address prefix_length extra <<<"$value"

  [ -z "${extra:-}" ] ||
    fail "$label must be an IPv4 /24 network (got: $value)"

  [ "$prefix_length" = "24" ] ||
    fail "$label must use /24 (got: $value)"

  IFS=. read -r a b c d extra <<<"$address"

  [ -z "${extra:-}" ] ||
    fail "$label must be an IPv4 /24 network (got: $value)"

  validate_octet "$a" &&
    validate_octet "$b" &&
    validate_octet "$c" &&
    validate_octet "$d" ||
    fail "$label contains an invalid IPv4 octet (got: $value)"

  [ "$d" -eq 0 ] ||
    fail "$label must be a canonical /24 ending in .0 (got: $value)"

  PARSED_PREFIX="${a}.${b}.${c}"
  PARSED_NETWORK="${PARSED_PREFIX}.0/24"
}

# The pod's network number fills the third octet, so the WAN supernet must be a
# /16 whose last two octets are zero.
parse_subnet16() {
  local label="$1"
  local value="$2"
  local address prefix_length
  local a b c d extra

  IFS=/ read -r address prefix_length extra <<<"$value"

  [ -z "${extra:-}" ] ||
    fail "$label must be an IPv4 /16 network in CIDR notation (got: $value)"

  [ -n "${prefix_length:-}" ] ||
    fail "$label must include a prefix length, e.g. 172.16.0.0/16 (got: $value)"

  [ "$prefix_length" = "16" ] ||
    fail "$label must use /16 (got: $value)"

  IFS=. read -r a b c d extra <<<"$address"

  [ -z "${extra:-}" ] ||
    fail "$label must be an IPv4 /16 network in CIDR notation (got: $value)"

  validate_octet "$a" &&
    validate_octet "$b" &&
    validate_octet "$c" &&
    validate_octet "$d" ||
    fail "$label contains an invalid IPv4 octet (got: $value)"

  [ "$c" -eq 0 ] && [ "$d" -eq 0 ] ||
    fail "$label must be a canonical /16 ending in .0.0 (got: $value)"

  PARSED_PREFIX="${a}.${b}"
  PARSED_PREFIX_LENGTH="$prefix_length"
  PARSED_GATEWAY="${a}.${b}.0.1"
}

validate_file_name() {
  local label="$1"
  local value="$2"

  [ -n "$value" ] ||
    fail "$label must not be empty"

  case "$value" in
    *'/'*|*'\'*|*'..'*|*[[:space:]]*)
      fail "$label must be a plain filename without separators, '..', or whitespace (got: $value)"
      ;;
  esac
}

validate_file_pattern() {
  local label="$1"
  local value="$2"
  local without_first

  validate_file_name "$label" "$value"

  case "$value" in
    *'{network}'*) ;;
    *)
      fail "$label must contain {network} exactly once (got: $value)"
      ;;
  esac

  without_first="${value/\{network\}/}"

  case "$without_first" in
    *'{network}'*)
      fail "$label must contain {network} exactly once (got: $value)"
      ;;
  esac
}

validate_vyos_command_quotes() {
  local path="$1"

  # VyOS cloud-init accepts either no quoted value or one final quoted
  # value. Multiple quote pairs cause path components to be parsed as
  # part of the final value.
  awk -F "'" '
    /^  - (set|delete) / && NF != 1 && NF != 3 {
      print "invalid VyOS command quoting on line " NR ": " $0 > "/dev/stderr"
      invalid = 1
    }
    END { exit invalid }
  ' "$path" ||
    fail "invalid single-quote placement in $path"

  # Route prefixes are tag/path components, not terminal values.
  if grep -Eq "set protocols static route '" "$path"; then
    fail "static route prefixes must not be quoted in $path"
  fi
}

write_network_config() {
  local path="$1"
  local interface_count="$2"
  local index

  {
    # No top-level "network:" key. This file is passed directly as the
    # NoCloud network-config document.
    echo 'version: 2'
    echo 'ethernets:'

    for ((index = 0; index < interface_count; index++)); do
      echo "  eth${index}:"
      echo '    match:'
      echo "      name: eth${index}"
      echo '    dhcp4: false'
    done
  } >"$path"
}

write_lan_router_user_data() {
  local path="$1"
  local network="$2"
  local wan_network="${wan_prefix}.${network}.0/24"
  local wan_gateway="${wan_prefix}.${network}.1"

  cat >"$path" <<EOF
#cloud-config
vyos_config_commands:
  - set interfaces ethernet eth0 description 'WAN'
  - set interfaces ethernet eth0 address '${wan_gateway}/${wan_prefix_length}'
  - set interfaces ethernet eth0 ip enable-proxy-arp
  - set interfaces ethernet eth1 description 'LAN'
  - set interfaces ethernet eth1 address '${lan_router_gateway}/24'
  - set protocols static route ${wan_network} interface 'eth1'
  - set protocols static route 0.0.0.0/0 next-hop '${wan_next_hop}'
  - set system name-server '${DNS_PRIMARY}'
  - set system name-server '${DNS_SECONDARY}'
  - set nat destination rule 10 description 'pod ${network} LAN prefix 1-to-1 inbound'
  - set nat destination rule 10 inbound-interface name 'eth0'
  - set nat destination rule 10 destination address '${wan_network}'
  - set nat destination rule 10 translation address '${lan_router_network}'
  - set nat source rule 10 description 'pod ${network} LAN prefix 1-to-1 outbound'
  - set nat source rule 10 outbound-interface name 'eth0'
  - set nat source rule 10 source address '${lan_router_network}'
  - set nat source rule 10 translation address '${wan_network}'
EOF

  validate_vyos_command_quotes "$path"
}

write_lan_dmz_router_user_data() {
  local path="$1"
  local network="$2"
  local wan_network="${wan_prefix}.${network}.0/24"
  local wan_gateway="${wan_prefix}.${network}.1"

  cat >"$path" <<EOF
#cloud-config
vyos_config_commands:
  - set interfaces ethernet eth0 description 'WAN'
  - set interfaces ethernet eth0 address '${wan_gateway}/${wan_prefix_length}'
  - set interfaces ethernet eth0 ip enable-proxy-arp
  - set interfaces ethernet eth1 description 'LAN'
  - set interfaces ethernet eth1 address '${lan_dmz_router_lan_gateway}/24'
  - set interfaces ethernet eth2 description 'DMZ'
  - set interfaces ethernet eth2 address '${lan_dmz_router_dmz_gateway}/24'
  - set protocols static route ${wan_network} interface 'eth2'
  - set protocols static route 0.0.0.0/0 next-hop '${wan_next_hop}'
  - set system name-server '${DNS_PRIMARY}'
  - set system name-server '${DNS_SECONDARY}'
  - set nat destination rule 1000 description 'pod ${network} DMZ prefix 1-to-1 inbound'
  - set nat destination rule 1000 inbound-interface name 'eth0'
  - set nat destination rule 1000 destination address '${wan_network}'
  - set nat destination rule 1000 translation address '${lan_dmz_router_dmz_network}'
  - set nat source rule 1000 description 'pod ${network} DMZ prefix 1-to-1 outbound'
  - set nat source rule 1000 outbound-interface name 'eth0'
  - set nat source rule 1000 source address '${lan_dmz_router_dmz_network}'
  - set nat source rule 1000 translation address '${wan_network}'
  - set nat source rule 5010 description 'pod ${network} LAN outbound masquerade'
  - set nat source rule 5010 outbound-interface name 'eth0'
  - set nat source rule 5010 source address '${lan_dmz_router_lan_network}'
  - set nat source rule 5010 translation address 'masquerade'
EOF

  validate_vyos_command_quotes "$path"
}

case "$NETWORK_PROFILE" in
  all|lan-router-v1|lan-dmz-router-v1) ;;
  *)
    fail "NETWORK_PROFILE must be one of: all, lan-router-v1, lan-dmz-router-v1 (got: $NETWORK_PROFILE)"
    ;;
esac

if [[ ! "$NETWORK_MIN" =~ ^[0-9]+$ ]] ||
  [[ ! "$NETWORK_MAX" =~ ^[0-9]+$ ]] ||
  [ "$NETWORK_MIN" -lt 1 ] ||
  [ "$NETWORK_MAX" -gt 254 ] ||
  [ "$NETWORK_MIN" -gt "$NETWORK_MAX" ]; then
  fail "NETWORK_MIN..NETWORK_MAX must be a non-empty range within 1-254 (got: $NETWORK_MIN-$NETWORK_MAX)"
fi

parse_subnet16 WAN_SUBNET "$WAN_SUBNET"
wan_prefix="$PARSED_PREFIX"
wan_prefix_length="$PARSED_PREFIX_LENGTH"
wan_next_hop="${WAN_NEXT_HOP:-$PARSED_GATEWAY}"

validate_ipv4 "$wan_next_hop" ||
  fail "WAN_NEXT_HOP must be a valid IPv4 address"

validate_ipv4 "$DNS_PRIMARY" ||
  fail "DNS_PRIMARY must be a valid IPv4 address"

validate_ipv4 "$DNS_SECONDARY" ||
  fail "DNS_SECONDARY must be a valid IPv4 address"

parse_subnet24 LAN_ROUTER_SUBNET "$LAN_ROUTER_SUBNET"
lan_router_prefix="$PARSED_PREFIX"
lan_router_network="$PARSED_NETWORK"

validate_host_octet "$LAN_ROUTER_GATEWAY_HOST" ||
  fail "LAN_ROUTER_GATEWAY_HOST must be within 1-254"

lan_router_gateway="${lan_router_prefix}.${LAN_ROUTER_GATEWAY_HOST}"

parse_subnet24 LAN_DMZ_ROUTER_LAN_SUBNET "$LAN_DMZ_ROUTER_LAN_SUBNET"
lan_dmz_router_lan_prefix="$PARSED_PREFIX"
lan_dmz_router_lan_network="$PARSED_NETWORK"

validate_host_octet "$LAN_DMZ_ROUTER_LAN_GATEWAY_HOST" ||
  fail "LAN_DMZ_ROUTER_LAN_GATEWAY_HOST must be within 1-254"

lan_dmz_router_lan_gateway="${lan_dmz_router_lan_prefix}.${LAN_DMZ_ROUTER_LAN_GATEWAY_HOST}"

parse_subnet24 LAN_DMZ_ROUTER_DMZ_SUBNET "$LAN_DMZ_ROUTER_DMZ_SUBNET"
lan_dmz_router_dmz_prefix="$PARSED_PREFIX"
lan_dmz_router_dmz_network="$PARSED_NETWORK"

validate_host_octet "$LAN_DMZ_ROUTER_DMZ_GATEWAY_HOST" ||
  fail "LAN_DMZ_ROUTER_DMZ_GATEWAY_HOST must be within 1-254"

lan_dmz_router_dmz_gateway="${lan_dmz_router_dmz_prefix}.${LAN_DMZ_ROUTER_DMZ_GATEWAY_HOST}"

[ "$lan_dmz_router_lan_network" != "$lan_dmz_router_dmz_network" ] ||
  fail "LAN and DMZ subnets must differ"

validate_file_pattern \
  LAN_ROUTER_USER_FILE_PATTERN \
  "$LAN_ROUTER_USER_FILE_PATTERN"

validate_file_name \
  LAN_ROUTER_NETWORK_CONFIG_FILE \
  "$LAN_ROUTER_NETWORK_CONFIG_FILE"

validate_file_pattern \
  LAN_DMZ_ROUTER_USER_FILE_PATTERN \
  "$LAN_DMZ_ROUTER_USER_FILE_PATTERN"

validate_file_name \
  LAN_DMZ_ROUTER_NETWORK_CONFIG_FILE \
  "$LAN_DMZ_ROUTER_NETWORK_CONFIG_FILE"

if [ "$NETWORK_PROFILE" = "all" ]; then
  [ "$LAN_ROUTER_NETWORK_CONFIG_FILE" != "$LAN_DMZ_ROUTER_NETWORK_CONFIG_FILE" ] ||
    fail "profile network-config filenames must differ when NETWORK_PROFILE=all"
fi

mkdir -p "$SNIPPET_DIR"
generated=0

if [ "$NETWORK_PROFILE" = "all" ] ||
  [ "$NETWORK_PROFILE" = "lan-router-v1" ]; then
  write_network_config \
    "$SNIPPET_DIR/$LAN_ROUTER_NETWORK_CONFIG_FILE" \
    2

  generated=$((generated + 1))
fi

if [ "$NETWORK_PROFILE" = "all" ] ||
  [ "$NETWORK_PROFILE" = "lan-dmz-router-v1" ]; then
  write_network_config \
    "$SNIPPET_DIR/$LAN_DMZ_ROUTER_NETWORK_CONFIG_FILE" \
    3

  generated=$((generated + 1))
fi

network="$NETWORK_MIN"

while [ "$network" -le "$NETWORK_MAX" ]; do
  lan_router_user_file="${LAN_ROUTER_USER_FILE_PATTERN/\{network\}/$network}"
  lan_dmz_router_user_file="${LAN_DMZ_ROUTER_USER_FILE_PATTERN/\{network\}/$network}"

  if [ "$NETWORK_PROFILE" = "all" ] &&
    [ "$lan_router_user_file" = "$lan_dmz_router_user_file" ]; then
    fail "profile user-data filenames collide for network $network"
  fi

  if [ "$NETWORK_PROFILE" = "all" ] ||
    [ "$NETWORK_PROFILE" = "lan-router-v1" ]; then
    write_lan_router_user_data \
      "$SNIPPET_DIR/$lan_router_user_file" \
      "$network"

    generated=$((generated + 1))
  fi

  if [ "$NETWORK_PROFILE" = "all" ] ||
    [ "$NETWORK_PROFILE" = "lan-dmz-router-v1" ]; then
    write_lan_dmz_router_user_data \
      "$SNIPPET_DIR/$lan_dmz_router_user_file" \
      "$network"

    generated=$((generated + 1))
  fi

  network=$((network + 1))
done

network_count=$((NETWORK_MAX - NETWORK_MIN + 1))
profile_count=1

if [ "$NETWORK_PROFILE" = "all" ]; then
  profile_count=2
fi

expected=$((profile_count + profile_count * network_count))

[ "$generated" -eq "$expected" ] ||
  fail "generated $generated files, expected $expected"

echo "generated $generated snippet file(s) for network profile '$NETWORK_PROFILE' in $SNIPPET_DIR"
echo "WAN subnet $WAN_SUBNET, next hop $wan_next_hop"
