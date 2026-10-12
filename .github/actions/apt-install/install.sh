#!/usr/bin/env bash
set -euo pipefail

cache="${HOME}/apt-cache"
read -r -a package_list <<< "${PACKAGES:?}"

restore_cache() {
  sudo mkdir -p /var/cache/apt/archives/partial /var/lib/apt/lists/partial
  if compgen -G "${cache}/archives/*.deb" > /dev/null; then
    sudo cp -n "${cache}/archives/"*.deb /var/cache/apt/archives/
  fi
  if [ -d "${cache}/lists" ] && compgen -G "${cache}/lists/*" > /dev/null; then
    sudo cp -a "${cache}/lists/." /var/lib/apt/lists/
  fi
}

save_cache() {
  mkdir -p "${cache}/archives" "${cache}/lists"
  if compgen -G "/var/cache/apt/archives/*.deb" > /dev/null; then
    cp -n /var/cache/apt/archives/*.deb "${cache}/archives/" || true
  fi
  sudo cp -a /var/lib/apt/lists/. "${cache}/lists/"
  sudo rm -f "${cache}/lists/lock"
  sudo chown -R "$(id -u):$(id -g)" "${cache}"
}

export DEBIAN_FRONTEND=noninteractive

if [ "${CACHE_HIT:-false}" = "true" ]; then
  restore_cache
  if sudo apt-get install -y --no-download "${package_list[@]}"; then
    exit 0
  fi
  echo "Cached apt packages were incomplete; installing from the network"
fi

sudo apt-get update
sudo apt-get install -y "${package_list[@]}"
save_cache
