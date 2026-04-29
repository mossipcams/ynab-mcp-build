#!/usr/bin/env sh
set -eu

install_dir=".bin"
binary="$install_dir/gitleaks"
api_url="https://api.github.com/repos/gitleaks/gitleaks/releases/latest"

if [ -x "$binary" ] && "$binary" version >/dev/null 2>&1; then
  "$binary" version
  exit 0
fi

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *)
    echo "Unsupported OS for automatic Gitleaks install: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *)
    echo "Unsupported architecture for automatic Gitleaks install: $(uname -m)" >&2
    exit 1
    ;;
esac

download_url="$(
  curl -sSfL "$api_url" |
    grep "browser_download_url" |
    grep "_${os}_${arch}.tar.gz" |
    cut -d '"' -f 4 |
    head -n 1
)"

if [ -z "$download_url" ]; then
  echo "Could not find a Gitleaks release asset for ${os}_${arch}" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$install_dir"
curl -sSfL "$download_url" -o "$tmpdir/gitleaks.tar.gz"
tar -xzf "$tmpdir/gitleaks.tar.gz" -C "$tmpdir" gitleaks
mv "$tmpdir/gitleaks" "$binary"
chmod +x "$binary"
"$binary" version
